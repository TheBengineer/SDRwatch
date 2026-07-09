(function(){
  const STORAGE_KEY = 'SDRWATCH_ACTIVE_BASELINE_ID';

  function persistBaseline(id){
    if(id && String(id).trim()){
      localStorage.setItem(STORAGE_KEY, String(id).trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function submitForm(form){
    if(!form){ return; }
    if(typeof form.requestSubmit === 'function'){
      form.requestSubmit();
    } else {
      form.submit();
    }
  }

  // Toggle signal selection via API
  async function toggleSignalSelection(signalId, button) {
    try {
      const resp = await fetch('/api/signals/' + signalId + '/toggle-selected', { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json();
        // Update button appearance
        button.textContent = data.selected ? '★' : '☆';
        button.classList.toggle('text-sky-400', data.selected);
        button.classList.toggle('text-slate-500', !data.selected);
        // Update card styling
        const card = button.closest('[data-signal-card]');
        if (card) {
          if (data.selected) {
            card.classList.remove('border-white/10', 'bg-slate-900/60');
            card.classList.add('border-sky-500/60', 'bg-sky-900/30', 'ring-1', 'ring-sky-500/40');
          } else {
            card.classList.add('border-white/10', 'bg-slate-900/60');
            card.classList.remove('border-sky-500/60', 'bg-sky-900/30', 'ring-1', 'ring-sky-500/40');
          }
        }
      }
    } catch (e) {
      console.error('Toggle selection failed:', e);
    }
  }

  // Update signal classification via API
  async function classifySignal(signalId, classification, selectEl) {
    try {
      const resp = await fetch('/api/signals/' + signalId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classification: classification })
      });
      if (resp.ok) {
        // Reload page to reflect new classification styling
        window.location.reload();
      } else {
        const data = await resp.json();
        console.error('Classification failed:', data.error);
        // Revert select to previous value
        selectEl.value = selectEl.dataset.previousValue || 'unknown';
      }
    } catch (e) {
      console.error('Classification failed:', e);
      selectEl.value = selectEl.dataset.previousValue || 'unknown';
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const state = window.SDRWATCH_DASHBOARD_STATE || {};
    const select = document.querySelector('[data-dashboard-baseline-select]');
    const form = document.querySelector('[data-dashboard-baseline-form]');
    const stored = localStorage.getItem(STORAGE_KEY);

    if(state.selected_baseline_id){
      persistBaseline(state.selected_baseline_id);
    } else if(stored && select && !select.value){
      select.value = stored;
    }

    if(select){
      select.addEventListener('change', ()=>{
        const value = select.value || '';
        persistBaseline(value);
        submitForm(form || select.closest('form'));
      });
    }

    const refreshBtn = document.querySelector('[data-dashboard-refresh]');
    if(refreshBtn){
      refreshBtn.addEventListener('click', (evt)=>{
        evt.preventDefault();
        submitForm(form || refreshBtn.closest('form'));
      });
    }

    document.querySelectorAll('[data-change-filter-link]').forEach((link)=>{
      link.addEventListener('click', ()=>{
        const current = select && select.value ? select.value : state.selected_baseline_id;
        if(current){ persistBaseline(current); }
      });
    });

    // Signal selection toggle buttons
    document.querySelectorAll('[data-toggle-select]').forEach((button)=>{
      const signalId = button.getAttribute('data-toggle-select');
      button.addEventListener('click', (evt)=>{
        evt.preventDefault();
        toggleSignalSelection(signalId, button);
      });
    });

    // Mute buttons — add ignore rule for frequency
    document.querySelectorAll('[data-mute-freq]').forEach((btn)=>{
      const freq = btn.getAttribute('data-mute-freq');
      if(!freq) return;
      btn.addEventListener('click', async (evt)=>{
        evt.preventDefault();
        try{
          const headers = {'Content-Type':'application/json'};
          const token = localStorage.getItem('SDRWATCH_TOKEN');
          if(token) headers['Authorization'] = 'Bearer '+token;
          const resp = await fetch('/api/ignore-rules', {
            method:'POST', headers,
            body: JSON.stringify({f_center_hz: parseInt(freq), tolerance_hz: 50000, label: 'Muted from dashboard'})
          });
          if(resp.ok){
            btn.textContent = '✅';
            btn.classList.remove('hover:text-amber-400');
            btn.title = 'Muted';
          }
        }catch(e){ console.error('Mute failed:', e); }
      });
    });

    // Recording status polling
    async function pollRecordingCard(){
      try{
        const r = await fetch('/api/now', { headers: {} });
        if(!r.ok) return;
        const data = await r.json();
        const card = document.getElementById('recording-status-card');
        if(!card) return;
        const pill = document.getElementById('rec-card-pill');
        const detail = document.getElementById('rec-card-detail');
        if(!pill || !detail) return;
        const job = data.job;
        if(job && job.params?.capture_iq){
          card.style.display = 'block';
          if(job.status === 'running'){
            pill.textContent = 'Recording';
            pill.className = 'chip text-xs bg-green-600/60 text-green-100';
            detail.textContent = 'Recording pass active — capturing IQ after sweep.';
          } else {
            pill.textContent = 'Idle';
            pill.className = 'chip text-xs bg-slate-500/60 text-slate-100';
            detail.textContent = 'Capture enabled, awaiting next sweep.';
          }
        } else {
          card.style.display = 'none';
        }
      }catch(e){ /* ignore polling errors */ }
    }
    setInterval(pollRecordingCard, 3000);
    setTimeout(pollRecordingCard, 500);

    // Signal classification dropdowns
    document.querySelectorAll('[data-classify-signal]').forEach((selectEl)=>{
      const signalId = selectEl.getAttribute('data-classify-signal');
      // Store initial value
      selectEl.dataset.previousValue = selectEl.value;
      selectEl.addEventListener('change', (evt)=>{
        const newValue = selectEl.value;
        classifySignal(signalId, newValue, selectEl);
        selectEl.dataset.previousValue = newValue;
      });
    });
  });
})();

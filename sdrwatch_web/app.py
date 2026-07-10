"""
Application factory for SDRwatch Web.

Wires together blueprints, DB lifecycle, error handling, and request middleware.
"""
from __future__ import annotations

import os
import traceback as tb
from datetime import datetime, timezone
from time import perf_counter
from typing import Any, Dict, List, Optional, Set

from flask import Flask, abort, g, request, send_from_directory

from sdrwatch_web.config import CONTROL_TOKEN, CONTROL_URL
from sdrwatch_web.controller import ControllerClient
from sdrwatch_web.db import init_db


def create_app(db_path: str) -> Flask:
    """Create and configure the Flask application."""
    app = Flask(__name__)

    # ------------------------------------------------------------------
    # App-level state
    # ------------------------------------------------------------------
    # Initialize database state using the shared db module
    init_db(app, db_path)

    # Legacy keys for backward compatibility with existing code
    app.config["DB_PATH"] = db_path
    app.config["DB_ERROR"] = app.config.get("SDRWATCH_DB_ERROR")
    app.config["DB_CONNECTION"] = app.config.get("SDRWATCH_DB_CON")
    app.config["HAS_CONFIDENCE_COLUMN"] = app.config.get("SDRWATCH_DB_HAS_CONFIDENCE")
    app.config["TABLE_COLUMNS_CACHE"] = app.config.get("SDRWATCH_DB_COLUMNS_CACHE", {})
    app.config["TABLE_EXISTS_CACHE"] = app.config.get("SDRWATCH_DB_EXISTS_CACHE", {})
    app.config["CONTROLLER_CLIENT"] = ControllerClient(CONTROL_URL, CONTROL_TOKEN)

    # ------------------------------------------------------------------
    # Error ring buffer (exposed via api_debug blueprint)
    # ------------------------------------------------------------------
    app.config["ERROR_RING"] = []
    app.config["ERROR_RING_MAX"] = 100

    # ------------------------------------------------------------------
    # Request timing middleware
    # ------------------------------------------------------------------

    @app.before_request
    def log_request_start():
        g.start_time = perf_counter()

    @app.after_request
    def log_request_end(response):
        if hasattr(g, "start_time"):
            duration_ms = (perf_counter() - g.start_time) * 1000
            # Log slow requests (>500ms) or errors at debug level
            if duration_ms > 500 or response.status_code >= 400:
                app.logger.debug(
                    "%s %s -> %d (%.1fms)",
                    request.method,
                    request.path,
                    response.status_code,
                    duration_ms,
                )
        return response

    # ------------------------------------------------------------------
    # Global error handler -> ring buffer
    # ------------------------------------------------------------------

    @app.errorhandler(Exception)
    def capture_error_to_ring(exc):
        # Let HTTP exceptions (404, 401, etc.) pass through without wrapping
        from werkzeug.exceptions import HTTPException
        if isinstance(exc, HTTPException):
            entry = {
                "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                "path": request.path,
                "method": request.method,
                "error": str(exc),
                "type": type(exc).__name__,
                "traceback": tb.format_exc(),
            }
            app.config["ERROR_RING"].append(entry)
            while len(app.config["ERROR_RING"]) > app.config["ERROR_RING_MAX"]:
                app.config["ERROR_RING"].pop(0)
            return exc
        entry = {
            "ts": datetime.now(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "path": request.path,
            "method": request.method,
            "error": str(exc),
            "type": type(exc).__name__,
            "traceback": tb.format_exc(),
        }
        app.config["ERROR_RING"].append(entry)
        while len(app.config["ERROR_RING"]) > app.config["ERROR_RING_MAX"]:
            app.config["ERROR_RING"].pop(0)
        raise exc

    # ------------------------------------------------------------------
    # Register blueprints
    # ------------------------------------------------------------------
    from sdrwatch_web.blueprints.api_baselines import bp as api_baselines_bp
    from sdrwatch_web.blueprints.api_charts import bp as api_charts_bp
    from sdrwatch_web.blueprints.api_debug import bp as api_debug_bp
    from sdrwatch_web.blueprints.api_spectrum import bp as api_spectrum_bp
    from sdrwatch_web.blueprints.api_jobs import bp as api_jobs_bp
    from sdrwatch_web.blueprints.api_recordings import bp as api_recordings_bp
    from sdrwatch_web.blueprints.api_signals import bp as api_signals_bp
    from sdrwatch_web.blueprints.ctl import bp as ctl_bp
    from sdrwatch_web.blueprints.views import bp as views_bp

    app.register_blueprint(api_debug_bp)
    app.register_blueprint(api_jobs_bp)
    app.register_blueprint(api_baselines_bp)
    app.register_blueprint(api_charts_bp)
    app.register_blueprint(api_spectrum_bp)
    app.register_blueprint(api_recordings_bp)
    app.register_blueprint(api_signals_bp)
    app.register_blueprint(ctl_bp)
    app.register_blueprint(views_bp)

    # ------------------------------------------------------------------
    # React SPA catch-all (must be after blueprint registrations)
    # ------------------------------------------------------------------
    REACT_DIST = os.path.join(os.path.dirname(__file__), '..', 'sdrwatch_ui', 'dist')

    @app.route('/assets/<path:filename>')
    def react_assets(filename):
        # Hashed assets — cache forever (hash changes on rebuild)
        return send_from_directory(os.path.join(REACT_DIST, 'assets'), filename,
                                   max_age=31536000)

    @app.route('/')
    @app.route('/<path:path>')
    def serve_react(path=''):
        # Skip API routes, control routes, export routes
        if path and (path.startswith('api/') or path.startswith('ctl/') or path.startswith('export/')):
            return abort(404)
        # Serve static files from React dist (non-hashed, e.g. favicon)
        if path:
            full = os.path.join(REACT_DIST, path)
            if os.path.exists(full) and os.path.isfile(full):
                return send_from_directory(REACT_DIST, path)
        # Serve index.html for SPA routing, inject token. No caching — always fresh.
        index_path = os.path.join(REACT_DIST, 'index.html')
        if os.path.exists(index_path):
            token = os.environ.get('SDRWATCH_TOKEN', '')
            with open(index_path) as f:
                html = f.read()
            if token:
                html = html.replace('</head>', f'<meta name="sdrwatch-token" content="{token}"></head>')
            return html, 200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        return abort(404)

    return app

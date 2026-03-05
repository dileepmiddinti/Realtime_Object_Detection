"""
Simple HTTP server to serve the frontend files
Run with: python serve.py
Then open: http://localhost:8000
"""

import os
import http.server
import socketserver

# Change to the frontend directory
os.chdir(os.path.join(os.path.dirname(__file__), 'frontend'))

PORT = 8000
Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"[*] Serving frontend on http://localhost:{PORT}")
    print(f"[*] Press Ctrl+C to stop")
    httpd.serve_forever()

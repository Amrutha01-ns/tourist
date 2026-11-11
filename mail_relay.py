"""
Tourist Karnataka - Local Email Relay Bridge
Receives HTTP POST requests on port 8089 and dispatches them via Gmail SMTP (port 587).
Used to bridge Render Free Tier (where port 587 is blocked) to live Gmail SMTP.
"""
import http.server
import json
import smtplib
from email.mime.text import MIMEText

PORT = 8089
GMAIL_USER = "studentmanagebyns@gmail.com"
GMAIL_PASS = "xecstlgxtwwxkthc"


class RelayHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status": "ready", "service": "Tourist Karnataka Email Relay"}')

    def do_POST(self):
        if self.path in ("/send-email", "/send-email/"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length).decode("utf-8")
                data = json.loads(body)
                
                to_email = data.get("to")
                subject = data.get("subject", "Tourist Web - Your Verification OTP")
                message = data.get("message", "")
                
                if not to_email:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b'{"error": "Missing recipient to"}')
                    return

                msg = MIMEText(message)
                msg["Subject"] = subject
                msg["From"] = f"Tourist Karnataka <{GMAIL_USER}>"
                msg["To"] = to_email

                with smtplib.SMTP("smtp.gmail.com", 587, timeout=12) as server:
                    server.starttls()
                    server.login(GMAIL_USER, GMAIL_PASS)
                    server.send_message(msg)

                print(f"[RELAY SUCCESS] Live email delivered to {to_email}")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status": "delivered"}')
            except Exception as e:
                print(f"[RELAY FAILED] Error: {e}")
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(f'{{"error": "{str(e)}" }}'.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Clean terminal logging
        print(f"[RELAY HTTP] {args[0]} {args[1]}")


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), RelayHandler)
    print(f"=== Tourist Karnataka Email Relay Active on Port {PORT} ===")
    print(f"Relaying from Gmail: {GMAIL_USER}")
    server.serve_forever()

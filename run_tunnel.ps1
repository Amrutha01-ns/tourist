# Auto-reconnecting localtunnel daemon
while ($true) {
    Write-Host "[TUNNEL] Starting localtunnel on port 8000 (subdomain: tourist-karnataka)..."
    & "C:\Program Files\nodejs\npx.cmd" localtunnel --port 8000 --subdomain tourist-karnataka
    Write-Host "[TUNNEL] Connection closed, restarting in 2 seconds..."
    Start-Sleep -Seconds 2
}

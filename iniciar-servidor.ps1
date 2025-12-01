# Servidor HTTP Simple para Taller Willian
Write-Host "====================================" -ForegroundColor Cyan
Write-Host " Servidor HTTP Local - Taller Willian" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Iniciando servidor en http://localhost:8000" -ForegroundColor Green
Write-Host ""
Write-Host "Para detener el servidor, presiona Ctrl+C" -ForegroundColor Yellow
Write-Host ""
Write-Host "Abre en tu navegador: " -NoNewline
Write-Host "http://localhost:8000/ventas_v2.html" -ForegroundColor Green
Write-Host ""

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8000/")
$listener.Start()

Write-Host "Servidor iniciado correctamente!" -ForegroundColor Green
Write-Host ""

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $path = $request.Url.LocalPath
        if ($path -eq "/") { $path = "/ventas_v2.html" }
        
        $filePath = Join-Path $PWD $path.TrimStart('/')
        
        Write-Host "$(Get-Date -Format 'HH:mm:ss') - " -NoNewline
        Write-Host "$($request.HttpMethod) $path" -ForegroundColor Cyan
        
        if (Test-Path $filePath -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            
            # Configurar Content-Type correcto
            $ext = [System.IO.Path]::GetExtension($filePath)
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".gif"  { "image/gif" }
                ".svg"  { "image/svg+xml" }
                default { "application/octet-stream" }
            }
            
            $response.ContentType = $contentType
            $response.ContentLength64 = $content.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($content, 0, $content.Length)
        }
        else {
            $response.StatusCode = 404
            $html = "<h1>404 - Archivo no encontrado</h1><p>$path</p>"
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($html)
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        
        $response.OutputStream.Close()
    }
}
finally {
    $listener.Stop()
    $listener.Close()
    Write-Host ""
    Write-Host "Servidor detenido." -ForegroundColor Yellow
}

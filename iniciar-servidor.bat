@echo off
echo ====================================
echo  Servidor HTTP Local - Taller Willian
echo ====================================
echo.
echo Iniciando servidor en http://localhost:8000
echo.
echo Para detener el servidor, presiona Ctrl+C
echo.
python -m http.server 8000
pause

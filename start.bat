@echo off
cd /d "%~dp0"

:: Copy .env.example to .env if .env doesn't exist
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env"
        echo === Copied .env.example to .env ===
        echo Please edit .env with your values, then run this script again.
        pause
        exit /b
    ) else (
        echo WARNING: No .env or .env.example found.
    )
)

:: Pull latest image
echo === Pulling latest Docker image ===
docker pull repo.eoxvantage.com/hackathon/environment

:: Run container
echo.
echo === Starting environment ===
echo   Dev URL: http://localhost:5173
echo.
docker run --rm -it -v .:/app -p 5173:5173 repo.eoxvantage.com/hackathon/environment

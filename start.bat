@echo off
rem Lance le serveur de l'application (Flask) puis ouvre le navigateur.
rem L'application est servie sur http://localhost:5001
cd /d "%~dp0"
start "" http://localhost:5001
"C:\Users\simon\AppData\Local\Programs\Python\Python312\python.exe" app.py

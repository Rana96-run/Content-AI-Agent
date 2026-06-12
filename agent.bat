@echo off
powershell -NoExit -ExecutionPolicy Bypass -Command "& { . '%~dp0agent.ps1' }"

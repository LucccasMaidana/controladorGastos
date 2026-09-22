$wsh = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "Controlador de Gastos.lnk"
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$shortcut.Arguments = "--app=https://lucccasmaidana.github.io/controladorGastos/?mode=admin"
$shortcut.Description = "Controlador de Gastos - Panel Administrador"
$shortcut.Save()
Write-Host "Acceso directo creado con exito en: $shortcutPath"

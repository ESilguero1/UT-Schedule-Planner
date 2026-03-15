Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Check if Python is available
rc = WshShell.Run("python --version", 0, True)
If rc <> 0 Then
    MsgBox "Python is not installed." & vbCrLf & vbCrLf & _
           "Download it from https://python.org/downloads" & vbCrLf & _
           "Make sure to check ""Add Python to PATH"" during install.", _
           vbExclamation, "UT Schedule Planner"
    WScript.Quit
End If

' Launch the app with no console window
WshShell.CurrentDirectory = scriptDir
WshShell.Run chr(34) & scriptDir & "\run.bat" & chr(34), 0, False

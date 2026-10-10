; Offer OmiComic in Open With and Default Apps without replacing the user's defaults.
!macro OmiRegisterExtension EXT
  WriteRegNone HKCU "Software\Classes\.${EXT}\OpenWithProgids" "OmiComic.Document"
  WriteRegStr HKCU "Software\Classes\Applications\OmiComic.exe\SupportedTypes" ".${EXT}" ""
  WriteRegStr HKCU "Software\OmiComic\Capabilities\FileAssociations" ".${EXT}" "OmiComic.Document"
!macroend

!macro OmiRemoveExtension EXT
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "OmiComic.Document"
!macroend

!macro OmiExtensions ACTION
  !insertmacro ${ACTION} "jpg"
  !insertmacro ${ACTION} "jpeg"
  !insertmacro ${ACTION} "png"
  !insertmacro ${ACTION} "webp"
  !insertmacro ${ACTION} "bmp"
  !insertmacro ${ACTION} "gif"
  !insertmacro ${ACTION} "zip"
  !insertmacro ${ACTION} "cbz"
  !insertmacro ${ACTION} "rar"
  !insertmacro ${ACTION} "cbr"
  !insertmacro ${ACTION} "7z"
  !insertmacro ${ACTION} "cb7"
  !insertmacro ${ACTION} "pdf"
  !insertmacro ${ACTION} "epub"
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\Classes\OmiComic.Document" "" "OmiComic"
  WriteRegStr HKCU "Software\Classes\OmiComic.Document\DefaultIcon" "" "$INSTDIR\OmiComic.exe,0"
  WriteRegStr HKCU "Software\Classes\OmiComic.Document\shell\open\command" "" '"$INSTDIR\OmiComic.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\OmiComic.exe" "FriendlyAppName" "OmiComic"
  WriteRegStr HKCU "Software\Classes\Applications\OmiComic.exe\DefaultIcon" "" "$INSTDIR\OmiComic.exe,0"
  WriteRegStr HKCU "Software\Classes\Applications\OmiComic.exe\shell\open\command" "" '"$INSTDIR\OmiComic.exe" "%1"'
  WriteRegStr HKCU "Software\OmiComic\Capabilities" "ApplicationName" "OmiComic"
  WriteRegStr HKCU "Software\OmiComic\Capabilities" "ApplicationDescription" "本地漫画、图片与电子书阅读器"
  WriteRegStr HKCU "Software\OmiComic\Capabilities" "ApplicationIcon" "$INSTDIR\OmiComic.exe,0"
  WriteRegStr HKCU "Software\RegisteredApplications" "OmiComic" "Software\OmiComic\Capabilities"
  !insertmacro OmiExtensions OmiRegisterExtension
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  !insertmacro OmiExtensions OmiRemoveExtension
  DeleteRegKey HKCU "Software\Classes\OmiComic.Document"
  DeleteRegKey HKCU "Software\Classes\Applications\OmiComic.exe"
  DeleteRegKey HKCU "Software\OmiComic\Capabilities"
  DeleteRegValue HKCU "Software\RegisteredApplications" "OmiComic"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'.',testMatch:'epub-legacy-recovery.e2e.ts',outputDir:'../test-results/epub-legacy-recovery',
  workers:1,timeout:60000,reporter:'list',
  use:{baseURL:'http://127.0.0.1:5208',viewport:{width:800,height:1200},hasTouch:true,isMobile:true,deviceScaleFactor:1},
  projects:[
    {name:'current'},
    ...(process.env.OMI_TABLET_BROWSER?[{name:'legacy',use:{launchOptions:{executablePath:process.env.OMI_TABLET_BROWSER}}}]:[]),
  ],
  webServer:{cwd:process.cwd(),command:'npx vite --host 127.0.0.1 --port 5208',url:'http://127.0.0.1:5208',reuseExistingServer:false},
});

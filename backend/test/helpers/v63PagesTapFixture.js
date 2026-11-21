"use strict";
// Synthetic unit-test fixture. Never used as CI evidence.
function publishedBrowserTap(){
 return `TAP version 13
# Subtest: Published bundle: Chrome, real Vite dist and SPA fallback
    # Subtest: mobile: 390px production login rendered
    ok 1 - mobile: 390px production login rendered
    # Subtest: desktop: 1440px production admin rendered
    ok 2 - desktop: 1440px production admin rendered
    # Subtest: SPA fallback: direct forgot-password route renders
    ok 3 - SPA fallback: direct forgot-password route renders
    1..3
ok 1 - Published bundle: Chrome, real Vite dist and SPA fallback
1..1
# tests 4
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
`;
}
module.exports={publishedBrowserTap};

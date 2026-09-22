import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { bootstrapAppearance } from "@/services/appearance-bootstrap";
import { isIsolatedDirectorRepro } from "@/lib/dev-repro";
import { installRcTriggerInsetFix } from "@/lib/fix-rc-trigger-inset";

// Fix Windows Chromium rc-trigger popup off-screen bug (inset shorthand overriding left/top).
installRcTriggerInsetFix();

// The public film entry checks its availability independently of workspace bootstrap.
if (/^\/welcome\/?$/.test(window.location.pathname)) void import("./welcome-application");
else {
    // The backend-free DEV lab must not make requests before AppProviders isolates it.
    const appearanceReady = isIsolatedDirectorRepro(import.meta.env.DEV, window.location.pathname) ? Promise.resolve() : bootstrapAppearance();
    void appearanceReady.finally(() => import("./application"));
}

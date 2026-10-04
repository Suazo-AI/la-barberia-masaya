# Fixture boundary

`local.ts` is opt-in local/test data, including made-up prices, services, professional identities and booking policies. The local server refuses fixture mode in a production process; the Worker entry never imports this directory. The static build has an explicit asset allowlist and copies none of these files.

`legacy-booking-model.js`, `legacy-booking-ui.js` and `legacy-browser/` preserve the previously approved in-memory demonstration from baseline `181bc7e`. Historical browser cases are not current acceptance checks and are deliberately outside both active Playwright test directories. The retained pure model tests cover the historical example; real persistence/concurrency and new UI checks are separate in `agenda/tests`.

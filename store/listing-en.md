# Chrome Web Store listing (en)

## Name

Autofill Assistant

## Short description (max. 132 characters)

Automatically fills in form fields on the sites you choose, using rules you create yourself.

(92 characters. Same text as the `extDescription` message in `public/_locales/en/messages.json`.)

## Detailed description

Tired of typing the same details into the same forms? Autofill Assistant fills in form fields for you, on the sites you choose, using rules you create yourself. No coding needed.

WHAT IT DOES
• Fills in form fields (text, lists, options, dates and searchable lists) according to your rules.
• Runs on its own when the form appears, or with one click on a button shown on the page itself.
• Shows a notice of what was filled, skipped or not found, and lets you undo.
• Supports dynamic values: your own variables, parameters from the page address, calculated dates, arithmetic, currency formatting and the value of other fields.
• Also works inside iframes, in fields inside web components (shadow DOM) and with components such as React-Select, Select2 and vue-multiselect.
• Right-click shortcuts: capture the field, fill with a rule and pause the site.
• Interface in English and Portuguese.

HOW IT WORKS

1. Open the site and click the extension icon.
2. Use "Capture a field on this page" and click the field you want to fill, or create the rule in Settings.
3. Set the value. It can be fixed text or an expression such as {{ var.city }} or {{ now | date("DD/MM/YYYY") }}.
4. Done: on your next visits the rule fills in by itself (or on click, as you prefer).

The extension comes with no rules and no access to any site. When you save a rule for a site, Chrome asks for your permission for that site. You can export, import and add rules from files, and pause the extension on any site.

PRIVACY
• It does not collect, send or sell any data. There is no server, usage analytics or ads.
• Your rules stay in the browser and, if you use Chrome sync, in your own Google account (chrome.storage.sync). Variables marked "This browser only" are never synced.
• Access to a site exists only after you allow it, and is used only to fill in the fields of your rules.
• Open source (MIT license): github.com/medeiroz/assistente-preenchimento

LIMITATIONS
• It does not submit forms: the extension never clicks submit, issue or confirm buttons.
• It does not solve CAPTCHAs and does not log in for you.
• Do not store passwords in rules. For sensitive data, use "This browser only" variables (they are not encrypted).
• Works on https and http sites (http sites show an insecure connection notice). Chrome internal pages and the Chrome Web Store do not allow extensions.
• Some sites with heavily customized forms may need a CSS selector in the rule.

Questions and suggestions: github.com/medeiroz/assistente-preenchimento/issues

## Suggested category

Productivity (alternative: Tools)

## Language

English, en

## Links

- Privacy policy: https://github.com/medeiroz/assistente-preenchimento/blob/main/PRIVACY.md
- Homepage / source code: https://github.com/medeiroz/assistente-preenchimento
- Support: https://github.com/medeiroz/assistente-preenchimento/issues

## Images

- Icon 128x128: `public/icon/128.png`
- Screenshots 1280x800: `store/screenshots/en/` (generate with `npm run screenshots -- --lang en`)
- Small promo tile 440x280: `store/promo-440x280.png`

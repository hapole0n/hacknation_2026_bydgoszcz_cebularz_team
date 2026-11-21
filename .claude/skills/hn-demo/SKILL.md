---
name: hn-demo
description: Verify the mandatory demo scenario, capture screenshots and write the 3-minute video script in Polish.
disable-model-invocation: true
---

1. Reset the database, load the demo case (Persona A "Jan Testowy" + trap Persona B), run the analysis. Verify all 7 stages of PLAN.md §2 and compare links, scores, bands and exclusions with `fixtures/expected.json`. List any mismatch.
2. Capture screenshots with Playwright into `docs/screenshots/`: case form, results with score breakdown, excluded list, graph, address detail with indicators and chronology, first page of the PDF report, diff view, audit log.
3. Write `docs/demo-script.md`: a 3:00 video script in Polish — timestamps, what to click, what to say; narration max ~380 words; it must show every mandatory stage.

Report to Oleh in Russian.

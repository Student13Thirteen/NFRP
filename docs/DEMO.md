# Demo script

Ten minutes, no real data. The only file involved is `examples/tolls/demo-tolls.csv`, which contains invented rows. Print the same list in a terminal with `bash nfrp demo`.

If NFRP is not installed yet, use `bash nfrp quickstart`: it runs the actual application locally and needs no server or tunnel.

## Before you start

```bash
bash nfrp doctor
bash nfrp credentials
```

Open the printed URL and sign in.

## 1. The dashboard

Open **Panoramica**. It shows only what needs attention, and every line links to the page that resolves it. On a fresh installation it is nearly empty, which is the correct starting point.

## 2. One place for every import

Open **Acquisisci**: fleet documents, container waybills, fuel, tolls, road fines, leasing and workshop invoices, each with its own card and expected format. Container waybills accept a phone photograph as well as a PDF.

## 3. Import a toll statement

Open the **Pedaggi** card and upload `examples/tolls/demo-tolls.csv`. The file is parsed and the rows stop in the review queue. Nothing has entered the costs yet.

Say it out loud, because it is the core of the product: **an import proposes, a person confirms.**

## 4. Review and confirm

Check date, plate, amount and card. Correct what is wrong, then confirm.

## 5. Show duplicate protection

Upload the same file again. The application recognises the same source and does not duplicate anything.

## 6. Show the result

Open **Pedaggi** for the register, then **Centro costi**: the confirmed amounts appear as costs, with the applied view stated above the totals. Drafts and discarded rows stay out.

## 7. Register a maintenance by hand

Open **Manutenzioni → Inserisci nuova manutenzione**. There is one entry for every case: the first cost row is already open, so a simple repair stays a short form; `Aggiungi riga` covers a workshop invoice with several items, each with its own VAT, category, vehicle or warehouse destination and driver.

Save it, and show that it appears in the same single register together with everything else.

## 8. Show a deadline

Open **Documenti → Nuovo documento**, attach an expiry a few days away to tractor `AB123CD`, save, and go back to **Panoramica**: the expiry is now on the board.

## 9. Make it look like the customer's company

Open **Impostazioni → Identità aziendale** and change the company name, the logo or a colour. The interface updates without a code change.

## 10. Show road control records

Open **Verbali**, then **Sinistri stradali**. The synthetic seed contains one invented record in each register. Open their detail pages to show links to vehicle/driver, status and deadlines, monetary fields and protected attachments.

**Verbali → Acquisisci da PDF** reads notice PDFs into drafts marked `Da controllare`. A draft proposes only the fields the document proves, stays out of the cost center and leaves review only after the mandatory fields are complete and a person confirms the check.

## 11. Registries that answer at a glance

Open **Autisti**. The list is there immediately, with a search field that filters while you type and a `Nuovo autista` button in the header. Search a plate to show that the query also matches the vehicle paired with a driver.

Open one driver, then the motor vehicle, then the trailer. Each page opens with `Complesso di oggi`: driver, motor vehicle and trailer for the current day, each linking to the other two. Where a link is missing the page says so instead of guessing, because the driver comes only from the dated assignment and the trailer only from the recorded pairing.

## What to avoid during a demo

Do not upload real company documents. There is no static substitute presented as a live demo: the locally installed, database-backed application is the product.

# Demo script

Ten minutes, no real data. The only file involved is `examples/tolls/demo-tolls.csv`, which contains invented rows. Print the same list in a terminal with `bash nfrp demo`.

## Before you start

```bash
bash nfrp doctor
bash nfrp credentials
```

Open the printed URL and sign in.

## 1. The dashboard

Open **Panoramica**. It shows only what needs attention, and every line links to the page that resolves it. On a fresh installation it is nearly empty, which is the correct starting point.

## 2. One place for every import

Open **Acquisisci**: fleet documents, container waybills, fuel, tolls, leasing and workshop invoices, each with its own card and expected format.

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

## What to avoid during a demo

Do not upload real company documents, and do not present the static product tour as the running application: the tour is a browser preview, the installation is the product.

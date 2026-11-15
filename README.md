# Token Radar — a pre-token launch radar

An entry for make.fun's **Build the best token launch radar** bounty
(`make.fun/bounty/token-radar-01`).

The snapshot DefiLlama handed the house lists 758 protocols. 342 of them record no token at
all — no market cap, no CoinGecko id, no ticker — so their launch is still ahead of them.
This program ranks those by **what a token would be worth if the protocol's record stayed
as it is**, and hands the reader a concrete plan for farming each one before or after it
issues one.

It does not predict whether or when a token is issued. Every implied value is this
entry's own claim.

## What it does

- `main.ts` (Node 22, standard library only) reads the sealed snapshot at
  `/input/snapshot.json`, scores every pre-token protocol with the model in `lib/model.ts`,
  and writes:
  - `/output/board.json` — the ranked board, one row per protocol, each with its implied
    value and its nine-step farm plan;
  - `/output/data.js` — the dashboard's dataset;
  - `/output/dashboard/` and `/output/screenshots/` — the page and its three screenshots;
  - `/output/dossier.json` — the dossier the judge reads, written with `buildDossier` from
    `vendor/makefun-board.ts` (the kit's own library, byte for byte).

Two runs write the same bytes: the snapshot is frozen and nothing in the model reads the
clock.

## The model

```
implied = round( tvl_usd
              × base_multiple                       (0.22)
              × (1 + clamp(change_7d, -50, 100)/100 × growth_weight)      (0.60)
              × (maturity_floor + min(age_days, 1460)/1460 × maturity_range)   (0.55 → 1.30)
              × (1 + min(max(chains − 1, 0), 14)/14 × reach_weight)        (1.00 → 1.30)
              × capture_rate(category)              (0.78 → 1.15) )
```

Five inputs, all read from the snapshot's own ten fields: the size of the machine (TVL),
the last seven days of it (`change_7d`), how long it has run with no token (`age_days`),
how far it is deployed (`chains`), and how much of its TVL the protocol could ever capture
as its own revenue (the category's rate). **No protocol is named anywhere in the model**,
so every row is reproducible and the page can recompute the whole board from the figures
printed beside it — it does, and it says so on the page.

The capture rate is a table of DefiLlama's own `category` field: a venue takes fees on
volume and a lender takes the spread (1.05–1.10), a protocol that issues its own asset
takes the issuance spread (1.00), and a risk curator holds other people's deposits and
takes a management fee on them (0.78).

Protocols whose token already trades are never mixed into that ranking. They are held
apart in their own table, where the market cap is a fact and not a model.

## The board

The house's watchlist — 40 protocols at or above $50M of TVL with no token on record — is
the floor of the board, never its ceiling. The board carries **every** pre-token protocol
in the snapshot: all 40 of the watchlist plus 155 found below the floor, each with its own
implied value and farm plan.

## The farm plan

Nine steps per protocol, each with what it costs and how long it takes. The category
decides the action and the risk, the chain decides the gas, the TVL decides the capital,
and how long the protocol has run with no token decides the window.

## The dashboard

A static page: `dashboard/index.html`, `dashboard/app.css` and `dashboard/app.js`. It
renders with no network — every byte it shows is in `data.js`. It is sortable on every
column, filterable by segment, category, chain, TVL floor and seven-day momentum, and
opens a detail view for each protocol with the model's own arithmetic, the snapshot's ten
fields and the farm plan.

## Running it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Needs Node 22.18 or later (the program is plain TypeScript, run with Node's own type
stripping — no build step, no install).

## Layout

```
main.ts                 the entry point
lib/model.ts            the snapshot parser, the value model, the farm plan
dashboard/index.html    the page
dashboard/app.css       the theme
dashboard/app.js        the page and its copy of the model
screenshots/            the board, a detail view, a filtered view
vendor/makefun-board.ts the kit's dossier library
```

## License

MIT — see `LICENSE`.

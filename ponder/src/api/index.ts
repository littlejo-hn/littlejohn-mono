import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { graphql } from "ponder";

// Read API. Ponder also serves /health (200 while alive) and /ready (200 once
// caught up to the chain head) automatically. GraphQL + SQL-over-HTTP is what the
// app's board / token / trades / candles endpoints will query.
const app = new Hono();

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

export default app;

# Payment integration boundary

Production must never accept a browser claim such as `paid=true`.

Required flow:
1. Customer sends product IDs, quantities, address and delivery zone.
2. Server/DB reloads product price, stock and delivery charge.
3. DB creates `pending_payment` order and payment record.
4. Gateway session/transaction is created for the delivery charge.
5. Customer completes bKash/Nagad/SSLCommerz/etc.
6. Gateway callback/webhook is verified server-side using the provider's official verification mechanism.
7. Only verified success changes `payments.status` to `paid` and `orders.status` to `confirmed`.
8. Use provider transaction ID/idempotency to prevent duplicate confirmation.
9. Inventory is decremented in the same verified confirmation transaction.

This ZIP includes a **TEST PAYMENT** only for local development. It is protected by both `DEMO_PAYMENT_MODE=true` on the local API and the DB setting `site_settings.demo_payment.enabled=true`. Keep both OFF in production.

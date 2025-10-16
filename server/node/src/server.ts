import express, { Request, Response } from "express";
import cors from "cors";

import { AmountBreakdown, AmountWithBreakdown, CheckoutPaymentIntent, Order, OrderRequest, PaymentSource, PurchaseUnit, PurchaseUnitRequest, Token, TokenType, type PaymentTokenResponse } from "@paypal/paypal-server-sdk";

import {
  getBrowserSafeClientToken,
  createOrder,
  createOrderWithSampleData,
  captureOrder,
  createPaymentToken,
  createSetupTokenWithSampleDataForPayPal,
} from "./paypalServerSdk";
import { randomUUID } from "node:crypto";

const app = express();

app.use(cors());
app.use(express.json());

/* ######################################################################
 * API Endpoints for the client-side JavaScript PayPal Integration code
 * ###################################################################### */

app.get(
  "/paypal-api/auth/browser-safe-client-token",
  async (_req: Request, res: Response) => {
    try {
      const { jsonResponse, httpStatusCode } =
        await getBrowserSafeClientToken();
      res.status(httpStatusCode).json(jsonResponse);
    } catch (error) {
      console.error("Failed to create browser safe access token:", error);
      res
        .status(500)
        .json({ error: "Failed to create browser safe access token." });
    }
  },
);

app.post(
  "/paypal-api/checkout/orders/create",
  async (req: Request, res: Response) => {
    try {
      const paypalRequestId = req.headers["paypal-request-id"]?.toString();
      const { jsonResponse, httpStatusCode } = await createOrder({
        orderRequestBody: req.body,
        paypalRequestId,
      });
      res.status(httpStatusCode).json(jsonResponse);
    } catch (error) {
      console.error("Failed to create order:", error);
      res.status(500).json({ error: "Failed to create order." });
    }
  },
);

app.post(
  "/paypal-api/checkout/orders/create-with-sample-data",
  async (req: Request, res: Response) => {
    try {
      const { jsonResponse, httpStatusCode } =
        await createOrderWithSampleData();
      res.status(httpStatusCode).json(jsonResponse);
    } catch (error) {
      console.error("Failed to create order:", error);
      res.status(500).json({ error: "Failed to create order." });
    }
  },
);

app.post(
  "/paypal-api/checkout/orders/:orderId/capture",
  async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const { jsonResponse, httpStatusCode } = await captureOrder(orderId);
      res.status(httpStatusCode).json(jsonResponse);
    } catch (error) {
      console.error("Failed to create order:", error);
      res.status(500).json({ error: "Failed to capture order." });
    }
  },
);

app.post(
  "/paypal-api/vault/setup-token/create",
  async (_req: Request, res: Response) => {
    try {
      const { jsonResponse, httpStatusCode } =
        await createSetupTokenWithSampleDataForPayPal();
      res.status(httpStatusCode).json(jsonResponse);
    } catch (error) {
      console.error("Failed to create setup token:", error);
      res.status(500).json({ error: "Failed to create setup token." });
    }
  },
);

app.post(
  "/paypal-api/vault/payment-token/create",
  async (req: Request, res: Response) => {
    try {
      const { jsonResponse, httpStatusCode } = await createPaymentToken(
        req.body.vaultSetupToken as string,
      );

      const paymentTokenResponse = jsonResponse as PaymentTokenResponse;

      if (paymentTokenResponse.id) {
        // This payment token id is a long-lived value for making
        // future payments when the buyer is not present.
        // PayPal recommends storing this value in your database
        // and NOT returning it back to the browser.
        await savePaymentTokenToDatabase(paymentTokenResponse);
        res.status(httpStatusCode).json({
          status: "SUCCESS",
          description:
            "Payment token saved to database for future transactions",
        });

        for (let i = 0; i < 2; i++) {
          console.log("creating order", i);
          const orderPayload = getPayPalOrderPayload(100, paymentTokenResponse.id);
          const { jsonResponse, httpStatusCode } = await createOrder({ orderRequestBody: orderPayload, paypalRequestId: "CREATE_ORDER_TEST_" + randomUUID().slice(0, 8) });

          if (httpStatusCode === 201) {
            const orderId = (jsonResponse as Order).id;
            console.log("order captured", orderId);
          } else {
            console.error("Failed to create order", jsonResponse);
            break;
          }

          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } else {
        res.status(httpStatusCode).json({
          status: "ERROR",
          description: "Failed to create payment token",
        });
      }
    } catch (error) {
      console.error("Failed to create payment token:", error);
      res.status(500).json({ error: "Failed to create payment token." });
    }
  },
);

function getPayPalOrderPayload(purchaseAmount: number, paymentTokenId: string) {
  return {
    intent: CheckoutPaymentIntent.Capture,
    purchaseUnits: [
      {
        amount: {
          currencyCode: "USD",
          value: purchaseAmount.toString(),
          breakdown: {
            itemTotal: {
              currencyCode: "USD",
              value: purchaseAmount.toString(),
            },
          },
        },
      },
    ],
    paymentSource: {
      token: {
        id: paymentTokenId,
        type: TokenType.BillingAgreement,
      },
    },
  } as OrderRequest;
}

async function savePaymentTokenToDatabase(
  paymentTokenResponse: PaymentTokenResponse,
) {
  // example function to teach saving the paymentToken to a database
  // to be used for future transactions
  return Promise.resolve();
}

const port = process.env.PORT ?? 8080;

app.listen(port, () => {
  console.log(`API server listening at http://localhost:${port}`);
});

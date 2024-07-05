const express = require("express");
const cors = require("cors");
const { Cashfree } = require("cashfree-pg");
const { v4: uuidv4 } = require("uuid");
const helmet = require("helmet");
const functions = require("firebase-functions");
const admin = require("firebase-admin");

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Get environment variables from Firebase Functions config
const config = functions.config();
const CASHFREE_CLIENT_ID = config.cashfree.client_id;
const CASHFREE_CLIENT_SECRET = config.cashfree.client_secret;
const ORIGIN_URL = config.cashfree.origin_url;
const RETURN_URL = config.cashfree.return_url;
const PAYMENTS_METHOD = config.cashfree.payments_method;
const ORDER_AMOUNT = config.cashfree.order_amount;

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert({
    type: config.fb.admin_type,
    project_id: config.fb.project_id,
    private_key_id: config.fb.private_key_id,
    private_key: config.fb.private_key.replace(/\\n/g, "\n"),
    client_email: config.fb.client_email,
    client_id: config.fb.client_id,
    auth_uri: config.fb.auth_uri,
    token_uri: config.fb.token_uri,
    auth_provider_x509_cert_url: config.fb.auth_provider_x509_cert_url,
    client_x509_cert_url: config.fb.client_x509_cert_url,
  }),
});

// Cashfree Configuration
Cashfree.XClientId = CASHFREE_CLIENT_ID;
Cashfree.XClientSecret = CASHFREE_CLIENT_SECRET;
Cashfree.XEnvironment = Cashfree.Environment.PRODUCTION;

// CORS Configuration
const corsOptions = {
  origin: ORIGIN_URL,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

// Routes
app.get("/payment", async (req, res) => {
  try {
    const { name, number, email } = req.query;

    const customId = `${uuidv4()}-001`;
    const orderId = uuidv4();

    const request = {
      order_amount: ORDER_AMOUNT,
      order_currency: "INR",
      order_id: orderId,
      customer_details: {
        customer_id: customId,
        customer_name: name,
        customer_email: email,
        customer_phone: number,
      },
      order_meta: {
        payment_methods: PAYMENTS_METHOD,
        return_url: RETURN_URL,
      },
    };

    const response = await Cashfree.PGCreateOrder("2023-08-01", request);
    if (response.data) {
      res.json(response.data);
    } else {
      throw new Error("Failed to create order");
    }
  } catch (error) {
    console.error("Error creating payment:", error);
    res.status(500).json({ error: "Error creating payment" });
  }
});

app.post("/verify", async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId" });
    }

    const response = await Cashfree.PGOrderFetchPayments("2023-08-01", orderId);
    res.json(response.data);
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ error: "Error verifying payment" });
  }
});

app.post("/validate-email", async (req, res) => {
  const { email } = req.body;
  try {
    await admin.auth().getUserByEmail(email);
    res.status(200).send({ exists: true });
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      res.status(200).send({ exists: false });
    } else {
      res.status(500).send({ error: "Internal Server Error" });
    }
  }
});

exports.api = functions.https.onRequest(app);

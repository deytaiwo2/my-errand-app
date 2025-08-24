import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import axios from "axios";

export default function PayWithPayPal() {
  return (
    <PayPalScriptProvider options={{ "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID }}>
      <PayPalButtons
        createOrder={async () => {
          const res = await axios.post("/api/payments/create-order", { amount: 25 });
          return res.data.id;
        }}
        onApprove={async (data) => {
          const res = await axios.post(`/api/payments/capture-order/${data.orderID}`);
          alert("Payment successful");
          console.log(res.data);
        }}
        onError={(err) => alert("PayPal error: " + err.message)}
      />
    </PayPalScriptProvider>
  );
}

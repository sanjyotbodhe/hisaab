import { useState } from 'react';
import { api } from '../lib/api.js';
import { formatINR } from '../lib/format.js';
import { loadRazorpay } from '../lib/razorpay.js';
import { useToast } from '../lib/toast.jsx';
import { Icon } from './icons.jsx';
import { Button } from './ui.jsx';

/**
 * Pay a group member through Razorpay Checkout. The server creates the order and,
 * after checkout, verifies Razorpay's signature before recording the payment.
 */
export default function RazorpayPay({ group, to, amount, onPaid }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    try {
      const order = await api(`/groups/${group.id}/payments/order`, {
        method: 'POST',
        body: { to: to.id, amount: (amount / 100).toFixed(2) },
      });
      const Razorpay = await loadRazorpay();
      const checkout = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'Hisaab',
        description: `${order.description}: pay ${to.name}`,
        prefill: order.prefill,
        notes: { group: group.name },
        theme: { color: '#1f9d4f' },
        handler: async (resp) => {
          try {
            await api(`/groups/${group.id}/payments/verify`, {
              method: 'POST',
              body: {
                orderId: resp.razorpay_order_id,
                paymentId: resp.razorpay_payment_id,
                signature: resp.razorpay_signature,
              },
            });
            toast.success(`Paid ${formatINR(order.amount)} to ${to.name}. Balances updated.`);
            onPaid();
          } catch (err) {
            toast.error(err.message);
            onPaid(); // the webhook may still have recorded it
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            toast.info('Payment cancelled. Nothing was charged.');
          },
        },
      });
      checkout.on('payment.failed', (resp) => {
        toast.error(resp?.error?.description || 'Payment failed. You can try again.');
      });
      checkout.open();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  }

  return (
    <Button className="btn-primary btn-sm" loading={busy} onClick={pay}>
      {!busy && <Icon name="wallet" size={15} />} Pay {formatINR(amount)} online
    </Button>
  );
}

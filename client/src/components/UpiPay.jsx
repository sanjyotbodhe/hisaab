import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { fromPaise } from '../lib/format.js';
import { Icon } from './icons.jsx';
import { Modal } from './ui.jsx';

/**
 * Standard UPI deep link (NPCI "upi://pay" spec). On a phone it opens GPay / PhonePe /
 * Paytm with the payee and amount filled in; on a laptop we show it as a QR code to scan.
 */
export function upiLink({ upiId, name, amount, note }) {
  const p = new URLSearchParams({ pa: upiId, pn: name, am: fromPaise(amount), cu: 'INR', tn: note.slice(0, 50) });
  return `upi://pay?${p.toString()}`;
}

export default function UpiPay({ payee, amount, note }) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState('');
  const link = upiLink({ upiId: payee.upiId, name: payee.name, amount, note });
  const isPhone = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#141d38', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [open, link]);

  return (
    <>
      {isPhone ? (
        <a className="btn btn-primary btn-sm" href={link}>
          <Icon name="wallet" size={15} /> Pay via UPI
        </a>
      ) : (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          <Icon name="qr" size={15} /> Pay via UPI
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={`Pay ${payee.name}`}>
        <div className="upi-box">
          {qr ? (
            <img src={qr} width="240" height="240" alt={`UPI QR code to pay ${payee.name}`} />
          ) : (
            <div className="upi-qr-placeholder" />
          )}
          <p className="hand upi-amount">₹{fromPaise(amount)}</p>
          <p className="muted small">
            Scan with any UPI app (GPay, PhonePe, Paytm). Paying to <strong>{payee.upiId}</strong>.
          </p>
          <p className="small">After paying, come back and press “Record payment” so balances update.</p>
        </div>
      </Modal>
    </>
  );
}

let loading = null;

/** Loads Razorpay Checkout once, on demand (only when someone actually pays). */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.async = true;
      s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay failed to load')));
      s.onerror = () => {
        loading = null;
        reject(new Error("Couldn't load Razorpay. Check your connection and try again."));
      };
      document.body.appendChild(s);
    });
  }
  return loading;
}

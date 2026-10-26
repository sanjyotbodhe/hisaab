// Must be imported before anything that reads config.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-long-enough-for-tests-1234';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://unused-in-tests';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret';
process.env.RAZORPAY_KEY_ID = 'rzp_test_hisaabTEST';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_123';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_456';

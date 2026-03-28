const express = require('express');
const app = express();
app.use(express.json());
app.post('/test', (req, res) => {
  console.log('Received:', req.body);
  res.json({ msg: 'OK' });
});
app.listen(5000, () => console.log('Test server on 5000'));
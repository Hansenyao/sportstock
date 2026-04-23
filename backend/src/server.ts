import 'dotenv/config';
import app from './app';
import config from './config';

const port = config.port;

app.listen(port, () => {
  console.log(`SportStock API running on port ${port} [${config.nodeEnv}]`);
});

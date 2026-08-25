import 'dotenv/config';

import { app } from './app';

const port = Number(process.env.API_PORT ?? 3000);

app.listen(port, () => {
  console.info(`API listening on port ${port}`);
});

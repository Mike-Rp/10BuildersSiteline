export const log = (message) => {
  const date = new Date();
  console.log(`[${date.toLocaleString()}] ${message}`);
};

export const errorlog = (message) => {
  const date = new Date();
  console.error(`[${date.toLocaleString()}] ${message}`);
};
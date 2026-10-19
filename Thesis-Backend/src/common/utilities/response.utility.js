export const responseOk = async (res, message, count, data) => {
  const body = {
    code: 200,
    message,
    count: parseInt(count),
    data
  };

  return res.status(200).json(body);
}

export const responseError = async (res, message, code = 500) => {
  const STATUS_TEXTS = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    410: 'Gone',
    422: 'Unprocessable Entity',
    500: 'Internal Server Error'
  };

  const status_text = STATUS_TEXTS[code] || 'Internal Server Error';

  const body = {
    code,
    status_text,
    message,
    error: {
      code: status_text.toUpperCase(),
      message
    }
  };

  return res.status(code).json(body);
}
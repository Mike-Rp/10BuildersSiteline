import _ from 'lodash';
export const mapSingle = (row) => {
  let role = {};
  role = mapDetails(row, role);
  role = refactorDictionaryToArrInv(role);
  return role;
}

export const mapMultiple = (rows, idKey) => {
  const roles = [];

  if (rows.length > 0) {
    let currentId = rows[0]["MAIN." + idKey];
    let role = {};

    rows.forEach(row => {
      if (currentId !== row["MAIN." + idKey]) {
        currentId = row["MAIN." + idKey];
        role = refactorDictionaryToArrInv(role);
        roles.push(role);
        role = {};
      }

      role = mapDetails(row, role);
    })

    role = refactorDictionaryToArrInv(role);
    roles.push(role);
  }

  return roles;
}

const mapDetails = (row, role) => {

  for (const key in row) {
    if (key.indexOf("MAIN.") > -1) {
      const newKey = key.replace("MAIN.", "");
      role[newKey] = parseAndFormatDate(row[key], key);
    } else if (key.indexOf("CREATED_BY.") > -1) {
      if (key === "CREATED_BY.id") {
        if (Object.keys(_.get(role, `created_by`, {})).length === 0) {
          role.created_by = {};
        } else {
          //do not overwrite created_by field
        }
      }

      role.created_by[key.replace("CREATED_BY.", "")] = row[key];
    } else if (key.indexOf("UPDATED_BY.") > -1) {
      if (key === "UPDATED_BY.id") {
        if (Object.keys(_.get(role, `updated_by`, {})).length === 0) {
          role.updated_by = {};
        } else {
          //do not overwrite updated_by field
        }
      }

      role.updated_by[key.replace("UPDATED_BY.", "")] = row[key];
    }

  }

  return role;
}

const refactorDictionaryToArrInv = (role) => {
  return role;
}

const formatDate = (dateInput, includeTime = true) => {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return dateInput;

  const options = { 
    year: 'numeric', 
    month: 'long', 
    day: '2-digit', 
    timeZone: 'Asia/Shanghai' 
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.hour12 = true;
  }

  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
  const p = parts.reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  if (!includeTime) {
    return `${p.month} ${p.day}, ${p.year}`;
  }

  return `${p.month} ${p.day}, ${p.year} ${p.hour}:${p.minute} ${p.dayPeriod}`;
};

const parseAndFormatDate = (value, key) => {
  if (!value) return value;
  if (value instanceof Date) return formatDate(value, true);

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (key.includes('date') || key.includes('_at')){
      const isDateOnly = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(trimmed);
      if (isDateOnly) {
        return formatDate(`${trimmed}T00:00:00`, false);
      }

      const normalized = trimmed.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:)/, '$1T$2');
      if (!isNaN(Date.parse(normalized))) {
        return formatDate(normalized, true);
      }
    }

    if (value === '{}') return [];
    if (value.includes("{") && value.includes("}")){
      return JSON.parse(value.split(',').join('","').replace('{', '["').replace('}', '"]'));
    }

    if (!isNaN(Number(trimmed))) {
      return Number(trimmed);
    }
  }

  return value;
};
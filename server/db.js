'use strict';

const path = require('node:path');
const fs = require('node:fs');

const SEED_PATH = path.join(__dirname, '..', 'data', 'seed.json');

const USER_PUBLIC_FIELDS = [
  'id',
  'username',
  'name',
  'email',
  'phone',
  'role',
  'loyaltyTier',
  'joinedAt',
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toPublicUser(user) {
  if (!user) return null;
  const output = {};
  for (const field of USER_PUBLIC_FIELDS) output[field] = user[field];
  return output;
}

/**
 * Store in-memory yang di-seed dari data/seed.json.
 * Restart proses = data kembali ke kondisi awal (tidak ada endpoint reset).
 */
function createDb(seed) {
  const data = clone(seed || JSON.parse(fs.readFileSync(SEED_PATH, 'utf8')));

  const users = data.users;
  const addresses = data.addresses;
  const orders = data.orders;
  const tickets = data.tickets;
  const auditLog = data.auditLog;

  function findUserById(id) {
    return users.find((user) => user.id === Number(id)) || null;
  }

  function findUserByUsername(username) {
    const needle = String(username || '').trim().toLowerCase();
    return users.find((user) => user.username.toLowerCase() === needle) || null;
  }

  function listUsers() {
    return users.map(toPublicUser);
  }

  function updateUser(id, patch) {
    const user = findUserById(id);
    if (!user) return null;
    Object.assign(user, patch);
    return user;
  }

  function deleteUser(id) {
    const index = users.findIndex((user) => user.id === Number(id));
    if (index === -1) return false;
    users.splice(index, 1);

    // Cascade sederhana supaya data turunan tidak menggantung.
    for (const collection of [addresses, orders, tickets]) {
      for (let i = collection.length - 1; i >= 0; i -= 1) {
        if (collection[i].userId === Number(id)) collection.splice(i, 1);
      }
    }
    return true;
  }

  function findAddress(id) {
    return addresses.find((address) => address.id === Number(id)) || null;
  }

  function listAddressesByUser(userId) {
    return addresses.filter((address) => address.userId === Number(userId));
  }

  function updateAddress(id, patch) {
    const address = findAddress(id);
    if (!address) return null;
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id' || key === 'userId') continue;
      address[key] = value;
    }
    return address;
  }

  function findOrder(id) {
    return orders.find((order) => order.id === Number(id)) || null;
  }

  function listOrdersByUser(userId) {
    return orders
      .filter((order) => order.userId === Number(userId))
      .sort((a, b) => String(b.placedAt).localeCompare(String(a.placedAt)));
  }

  function findTicket(id) {
    return tickets.find((ticket) => ticket.id === Number(id)) || null;
  }

  function listTicketsByUser(userId) {
    return tickets
      .filter((ticket) => ticket.userId === Number(userId))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function listOrders() {
    return orders.slice();
  }

  function addAudit(entry) {
    auditLog.push({
      at: new Date().toISOString(),
      ...entry,
    });
  }

  function listAuditLog() {
    return auditLog
      .slice()
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

  return {
    seed: data,
    users,
    addresses,
    orders,
    tickets,
    findUserById,
    findUserByUsername,
    listUsers,
    updateUser,
    deleteUser,
    findAddress,
    listAddressesByUser,
    updateAddress,
    findOrder,
    listOrdersByUser,
    listOrders,
    findTicket,
    listTicketsByUser,
    addAudit,
    listAuditLog,
  };
}

module.exports = { createDb, toPublicUser, SEED_PATH, USER_PUBLIC_FIELDS };

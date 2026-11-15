'use strict';

const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const SEED_PATH = path.join(ROOT, 'data', 'seed.json');


const USER_PUBLIC_FIELDS = [
  'id',
  'username',
  'name',
  'email',
  'phone',
  'role',
  'status',
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
const PROFILE_PUBLIC_FIELDS = ['id', 'username', 'name', 'role', 'loyaltyTier', 'joinedAt'];

function toPublicProfile(user, { full = false } = {}) {
  if (!user) return null;
  if (full) return toPublicUser(user);
  const output = {};
  for (const field of PROFILE_PUBLIC_FIELDS) output[field] = user[field];
  return output;
}


function toDocument(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    folderId: doc.folderId,
    ownerId: doc.ownerId,
    filename: doc.filename,
    mime: doc.mime,
    size: doc.size,
    createdAt: doc.createdAt,
  };
}

function nextId(collection) {
  return collection.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
}

function byDateDesc(field) {
  return (a, b) => String(b[field]).localeCompare(String(a[field]));
}

/**
 * Store in-memory yang di-seed dari data/seed.json.
 * Restart proses = data kembali ke kondisi awal (tidak ada endpoint reset).
 * Isi dokumen disimpan di memori, bukan di filesystem, agar reset benar-benar
 * bersih dan lab tidak menyentuh file pengguna.
 */
function createDb(seed) {
  const data = clone(seed || JSON.parse(fs.readFileSync(SEED_PATH, 'utf8')));

  const users = data.users;
  const addresses = data.addresses;
  const orders = data.orders;
  const products = data.products;
  const invoices = data.invoices;
  const tickets = data.tickets;
  const folders = data.folders;
  const documents = data.documents;
  const employees = data.employees;
  const articles = data.articles;
  const settings = data.settings;
  const roleChangeRequests = data.roleChangeRequests;
  const auditLog = data.auditLog;
  const carts = [];

  const documentContents = new Map();

  for (const doc of documents) {
    if (typeof doc.seedContent !== 'string') continue;
    documentContents.set(doc.id, Buffer.from(doc.seedContent, 'utf8'));
    doc.size = Buffer.byteLength(doc.seedContent);
  }

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

  function createUser({ username, passwordHash, name, email, phone = '' }) {
    const used = new Set(users.map((user) => user.id));
    let id = 1003;
    while (used.has(id)) id += 1;
    const user = {
      id,
      username,
      passwordHash,
      role: 'customer',
      status: 'active',
      name,
      email,
      phone,
      loyaltyTier: 'New',
      joinedAt: new Date().toISOString().slice(0, 10),
    };
    users.push(user);
    return user;
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
    for (const collection of [addresses, orders, tickets, invoices, folders]) {
      for (let i = collection.length - 1; i >= 0; i -= 1) {
        if (collection[i].userId === Number(id) || collection[i].ownerId === Number(id)) {
          collection.splice(i, 1);
        }
      }
    }
    for (let i = documents.length - 1; i >= 0; i -= 1) {
      if (documents[i].ownerId === Number(id)) documents.splice(i, 1);
    }
    for (let i = roleChangeRequests.length - 1; i >= 0; i -= 1) {
      if (
        roleChangeRequests[i].targetId === Number(id) ||
        roleChangeRequests[i].requestedBy === Number(id)
      ) {
        roleChangeRequests.splice(i, 1);
      }
    }
    for (let i = carts.length - 1; i >= 0; i -= 1) {
      if (carts[i].userId === Number(id)) carts.splice(i, 1);
    }
    return true;
  }


  function findAddress(id) {
    return addresses.find((address) => address.id === Number(id)) || null;
  }

  function listAddressesByUser(userId) {
    return addresses.filter((address) => address.userId === Number(userId));
  }

  function createAddress(userId, input) {
    const address = {
      id: nextId(addresses),
      userId: Number(userId),
      ...input,
    };
    addresses.push(address);
    return address;
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
      .sort(byDateDesc('placedAt'));
  }

  function listOrders() {
    return orders.slice().sort(byDateDesc('placedAt'));
  }

  function createOrder({ userId, addressId, items, status = 'Menunggu pembayaran', paymentStatus = 'unpaid', courier = '-', trackingNumber = '-' }) {
    const total = items.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
    const order = {
      id: nextId(orders),
      userId: Number(userId),
      addressId: Number(addressId),
      status,
      paymentStatus,
      placedAt: new Date().toISOString(),
      courier,
      trackingNumber,
      items,
      total,
    };
    orders.push(order);
    return order;
  }

  function updateOrder(id, patch) {
    const order = findOrder(id);
    if (!order) return null;
    Object.assign(order, patch);
    return order;
  }

  function findInvoice(id) {
    return invoices.find((invoice) => invoice.id === Number(id)) || null;
  }

  function findByOrderId(orderId) {
    return invoices.find((invoice) => invoice.orderId === Number(orderId)) || null;
  }

  function listInvoicesByUser(userId) {
    return invoices
      .filter((invoice) => invoice.userId === Number(userId))
      .sort(byDateDesc('issuedAt'));
  }

  function listInvoices() {
    return invoices.slice().sort(byDateDesc('issuedAt'));
  }

  function createInvoice(order) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const id = nextId(invoices);
    const invoice = {
      id,
      number: `INV-${year}-${id}`,
      orderId: order.id,
      userId: order.userId,
      issuedAt: now.toISOString().slice(0, 10),
      dueAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      status: order.paymentStatus === 'paid' ? 'paid' : 'unpaid',
      subtotal: order.total,
      tax: 0,
      shipping: 0,
      total: order.total,
      paidAt: order.paymentStatus === 'paid' ? now.toISOString() : null,
    };
    invoices.push(invoice);
    return invoice;
  }

  function findTicket(id) {
    return tickets.find((ticket) => ticket.id === Number(id)) || null;
  }

  function listTicketsByUser(userId) {
    return tickets
      .filter((ticket) => ticket.userId === Number(userId))
      .sort(byDateDesc('createdAt'));
  }

  function listTickets() {
    return tickets.slice().sort(byDateDesc('createdAt'));
  }

  function createTicket(userId, { subject, orderId, body }) {
    const now = new Date().toISOString();
    const ticket = {
      id: nextId(tickets),
      userId: Number(userId),
      orderId: orderId ? Number(orderId) : null,
      subject,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      internalNotes: '',
      messages: [],
    };
    tickets.push(ticket);
    addTicketMessage(ticket.id, {
      authorId: userId,
      body,
      internal: false,
    });
    return ticket;
  }

  function nextMessageId() {
    let max = 0;
    for (const ticket of tickets) {
      for (const message of ticket.messages || []) {
        if (Number(message.id) > max) max = Number(message.id);
      }
    }
    return max + 1;
  }

  function addTicketMessage(ticketId, { authorId, body, internal = false }) {
    const ticket = findTicket(ticketId);
    if (!ticket) return null;
    const author = findUserById(authorId);
    const at = new Date().toISOString();
    const message = {
      id: nextMessageId(),
      authorId: Number(authorId),
      authorName: author ? author.name : 'Pengguna',
      authorRole: author ? author.role : 'customer',
      internal: internal === true,
      at,
      body,
    };
    ticket.messages.push(message);
    ticket.updatedAt = at;
    return message;
  }

  function updateTicket(id, patch) {
    const ticket = findTicket(id);
    if (!ticket) return null;
    Object.assign(ticket, patch);
    ticket.updatedAt = new Date().toISOString();
    return ticket;
  }

  function findProduct(id) {
    return products.find((product) => product.id === Number(id)) || null;
  }

  function listProducts({ sellerId, includeInactive = false } = {}) {
    return products.filter((product) => {
      if (!includeInactive && product.active === false) return false;
      if (sellerId !== undefined && product.sellerId !== Number(sellerId)) return false;
      return true;
    });
  }

  function createProduct(sellerId, input) {
    const seller = findUserById(sellerId);
    const product = {
      id: nextId(products),
      sellerId: Number(sellerId),
      sellerName: seller ? seller.name : 'Penjual',
      active: true,
      ...input,
    };
    products.push(product);
    return product;
  }

  function updateProduct(id, patch) {
    const product = findProduct(id);
    if (!product) return null;
    Object.assign(product, patch);
    return product;
  }

  function deleteProduct(id) {
    const index = products.findIndex((product) => product.id === Number(id));
    if (index === -1) return false;
    products.splice(index, 1);
    for (const cart of carts) {
      cart.items = cart.items.filter((item) => item.productId !== Number(id));
    }
    return true;
  }

  function getCart(userId) {
    let cart = carts.find((row) => row.userId === Number(userId));
    if (!cart) {
      cart = { userId: Number(userId), items: [] };
      carts.push(cart);
    }
    return cart;
  }

  function cartView(userId) {
    const cart = getCart(userId);
    const items = [];
    for (const line of cart.items) {
      const product = findProduct(line.productId);
      if (!product || product.active === false) continue;
      items.push({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        price: product.price,
        qty: line.qty,
        lineTotal: product.price * line.qty,
        tone: product.tone,
      });
    }
    return {
      items,
      count: items.reduce((sum, item) => sum + item.qty, 0),
      subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
    };
  }

  function addCartItem(userId, productId, qty) {
    const cart = getCart(userId);
    const line = cart.items.find((item) => item.productId === Number(productId));
    if (line) line.qty += qty;
    else cart.items.push({ productId: Number(productId), qty });
    return cart;
  }

  function updateCartItem(userId, productId, qty) {
    const cart = getCart(userId);
    if (qty <= 0) {
      cart.items = cart.items.filter((item) => item.productId !== Number(productId));
    } else {
      const line = cart.items.find((item) => item.productId === Number(productId));
      if (line) line.qty = qty;
      else cart.items.push({ productId: Number(productId), qty });
    }
    return cart;
  }

  function removeCartItem(userId, productId) {
    const cart = getCart(userId);
    cart.items = cart.items.filter((item) => item.productId !== Number(productId));
    return cart;
  }

  function clearCart(userId) {
    const cart = getCart(userId);
    cart.items = [];
    return cart;
  }

  function findFolder(id) {
    return folders.find((folder) => folder.id === Number(id)) || null;
  }

  function listFoldersByOwner(ownerId) {
    return folders.filter((folder) => folder.ownerId === Number(ownerId));
  }

  function findDocument(id) {
    return documents.find((doc) => doc.id === Number(id)) || null;
  }

  function listDocumentsByOwner(ownerId) {
    return documents
      .filter((doc) => doc.ownerId === Number(ownerId))
      .sort(byDateDesc('createdAt'));
  }

  function createFolder({ ownerId, name, orgId = null }) {
    const folder = {
      id: nextId(folders),
      orgId,
      name,
      ownerId: Number(ownerId),
    };
    folders.push(folder);
    return folder;
  }

  function listDocumentsByFolder(folderId) {
    return documents
      .filter((doc) => doc.folderId === Number(folderId))
      .sort(byDateDesc('createdAt'));
  }

  function createDocument({ ownerId, folderId, filename, mime, size, content }) {
    const doc = {
      id: nextId(documents),
      ownerId: Number(ownerId),
      folderId: Number(folderId),
      filename,
      mime,
      size,
      createdAt: new Date().toISOString(),
    };
    documents.push(doc);
    documentContents.set(doc.id, content);
    return doc;
  }

  function getDocumentContent(id) {
    return documentContents.get(Number(id)) || null;
  }

  function findEmployeeByGuid(guid) {
    return employees.find((employee) => employee.guid === String(guid)) || null;
  }

  function listEmployees() {
    return employees.slice();
  }

  function findArticleBySlug(slug) {
    return articles.find((article) => article.slug === String(slug)) || null;
  }

  function listArticles() {
    return articles.slice().sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  }

  function getSettings() {
    return clone(settings);
  }

  function updateSettings(patch) {
    Object.assign(settings, patch);
    return getSettings();
  }

  function listRoleChangeRequests() {
    return roleChangeRequests.slice();
  }

  function createRoleChangeRequest({ targetId, role, requestedBy }) {
    const request = {
      id: nextId(roleChangeRequests),
      targetId: Number(targetId),
      role,
      requestedBy: Number(requestedBy),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    roleChangeRequests.push(request);
    return request;
  }

  function findRoleChangeRequest(id) {
    return roleChangeRequests.find((request) => request.id === Number(id)) || null;
  }

  function stats() {
    return {
      users: users.length,
      customers: users.filter((user) => user.role === 'customer').length,
      sellers: users.filter((user) => user.role === 'seller').length,
      products: products.length,
      orders: orders.length,
      revenue: orders
        .filter((order) => order.paymentStatus === 'paid')
        .reduce((sum, order) => sum + order.total, 0),
      openTickets: tickets.filter((ticket) => ticket.status === 'open').length,
    };
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
    products,
    invoices,
    tickets,
    folders,
    documents,
    employees,
    articles,
    settings,
    roleChangeRequests,
    carts,
    findUserById,
    findUserByUsername,
    listUsers,
    createUser,
    updateUser,
    deleteUser,
    findAddress,
    listAddressesByUser,
    createAddress,
    updateAddress,
    findOrder,
    listOrdersByUser,
    listOrders,
    createOrder,
    updateOrder,
    findInvoice,
    findByOrderId,
    listInvoicesByUser,
    listInvoices,
    createInvoice,
    findTicket,
    listTicketsByUser,
    listTickets,
    createTicket,
    addTicketMessage,
    updateTicket,
    findProduct,
    listProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    getCart,
    cartView,
    addCartItem,
    updateCartItem,
    removeCartItem,
    clearCart,
    findFolder,
    listFoldersByOwner,
    findDocument,
    listDocumentsByOwner,
    createDocument,
    getDocumentContent,
    findEmployeeByGuid,
    listEmployees,
    findArticleBySlug,
    listArticles,
    getSettings,
    updateSettings,
    createFolder,
    listDocumentsByFolder,
    listRoleChangeRequests,
    createRoleChangeRequest,
    findRoleChangeRequest,
    stats,
    addAudit,
    listAuditLog,
  };
}

module.exports = {
  createDb,
  toPublicUser,
  toDocument,
  toPublicProfile,
  SEED_PATH,
  USER_PUBLIC_FIELDS,
};

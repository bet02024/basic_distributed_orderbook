"use strict";
const { PeerRPCServer, PeerRPCClient } = require("grenache-nodejs-http");
const Link = require("grenache-nodejs-link");
const { v4: uuidv4 } = require("uuid");
const _clientId = uuidv4();

// ########  SERVER SETUP
const link = new Link({
  grape: "http://127.0.0.1:30001",
});
const linkClient = new Link({
    grape: "http://127.0.0.1:30001",
  });
link.start();
linkClient.start();

const peer = new PeerRPCServer(link, {
  timeout: 300000,
});
peer.init();
const port = 1024 + Math.floor(Math.random() * 1000);
const service = peer.transport("server");
service.listen(port);
setInterval(function () {
    link.announce("rpc_exchange", service.port, {});
  }, 1000);


// ########  CLIENT SETUP
const peerClient = new PeerRPCClient(linkClient, {maxActiveKeyDests:100, maxActiveDestTransports:100});
peerClient.init();

// ######## CONSTANTS & STORAGE VARIABLES
let orderBook = [];
let trades = [];
const ACTION = {
  CREATE: 1,
  CANCEL: 2,
  GET_ORDERBOOK: 3,
};
const SIDE = {
  BUY: 1,
  SELL: 2,
};

// ######## ORDERBOOK SYNC LOGIC
//Get a copy of the current orderbook from the other nodes
peerClient.request(
  "rpc_exchange",
  { action: ACTION.GET_ORDERBOOK },
  { timeout: 10000 },
  (err, data) => {
    //if (err) {
      //console.error(err);
    //}
    console.log(data);
    if (data && data.success) {
      //Sync the OrderBook
      orderBook = data.orderBook;
      trades = data.trades;
    }
  }
);

// ######## MAIN LOOP

service.on("request", async (rid, key, order, handler) => {
  let response = {};
  try {
    if (order.action === ACTION.CREATE) {
      if (order.client === _clientId){
        response = {
            success: true,
            message: "Already proccesed by this node",
        }
      } else {
        console.log("Create new order ", order );
        response = await createOrder(
          order.symbol,
          order.quantity,
          order.price,
          order.side,
          order.client
        );
      }
    } else if (order.action === ACTION.CANCEL) {
      response = await closeOrder(order.orderId, order.client);
    } else if (order.action === ACTION.GET_ORDERBOOK) {
      response = await getOrderBook();
    }
  } catch (e) {
    console.log("##Error on request ## :: ", e);
    response = {
      success: false,
      message: "Unexpected Error",
    };
  }
  handler.reply(null, response);
});

// ######## ORDER BOOK LOGIC

const createOrder = async (symbol, quantity, price, side, client) => {
  let message = ""
  let success = true;
  try {
    const clientOrders = orderBook.filter((order) => order.client === client);
    let orderId = clientOrders.length + 1;
    const newOrder = {
      symbol,
      quantity,
      price,
      side,
      orderId,
      client,
    };
    orderBook.push(newOrder);
    matchOrders();
    message = `Your order has been placed succesful: ${client}`;
  } catch (e) {
    console.log("#Error creating Order", e);
    message = "Error while creating your order";
    success = false;
  }
  return {
    success: success,
    message: message,
  };
};

function matchOrders() {
  const buyOrders = orderBook.filter((order) => order.side === SIDE.BUY);
  const sellOrders = orderBook.filter((order) => order.side === SIDE.SELL);
  // Iterate OrderBook buy orders
  for (const buyOrder of buyOrders) {
    // Iterate OrderBook sell orders
    for (const sellOrder of sellOrders) {
      if (
        buyOrder.symbol === sellOrder.symbol &&
        buyOrder.price >= sellOrder.price &&
        buyOrder.quantity > 0 &&
        sellOrder.quantity > 0
      ) {
        // it is a match
        const matchedQuantity = Math.min(buyOrder.quantity, sellOrder.quantity);
        console.log(`Excecuted trade:`);
        console.log(
          `${buyOrder.client} orderId ${buyOrder.orderId} buy ${matchedQuantity} ${buyOrder.symbol} at $${sellOrder.price} with Seller  ${sellOrder.client} orderId ${sellOrder.orderId}`
        );

        const newTrade = {
          symbol: buyOrder.symbol,
          quantity: matchedQuantity,
          price: sellOrder.price,
          sellOrder: sellOrder.orderId,
          buyOrder: buyOrder.orderId,
          maker: sellOrder.client,
          taker: buyOrder.client,
        };
        trades.push(newTrade);
        buyOrder.quantity -= matchedQuantity;
        sellOrder.quantity -= matchedQuantity;

        if (buyOrder.quantity === 0) {
          orderBook.splice(orderBook.indexOf(buyOrder), 1);
        }
        if (sellOrder.quantity === 0) {
          orderBook.splice(orderBook.indexOf(sellOrder), 1);
        }
      }
    }
  }
}

//cancel an order by ID
const closeOrder = async (orderId, client) => {
  let message = "not found";
  let success = false;
  const orders = orderBook.filter((order) => order.orderId === orderId);
  for (const order of orders) {
    if (order.client === client) {
      orderBook.splice(orderBook.indexOf(order), 1);
      message = `orderId ${orderId} canceled`;
      success = true;
    } else {
      message = "the orderId does not belongs to the client";
    }
  }
  return {
    success: success,
    message: message,
  };
};

//get the latest orderbook & trading data
const getOrderBook = async () => {
  return {
    success: true,
    orderBook: orderBook,
    trades: trades,
  };
};

// ##### CLIENT LOGIC TO PLACE ORDERS

const randomIntFromInterval = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

const randomSymbol = () => {
  if (randomIntFromInterval(1, 2) === 2) {
    return "BTC";
  } else {
    return "ETH";
  }
};

const randomSide = () => {
  if (randomIntFromInterval(1, 2) === 2) {
    return SIDE.BUY;
  } else {
    return SIDE.SELL;
  }
};


// Generate orders to place in the orderbook every 10 seconds
setInterval(async function () {
  try {
    let order = {
      action: ACTION.CREATE,
      symbol: randomSymbol(),
      quantity: randomIntFromInterval(1, 200),
      price: randomIntFromInterval(1, 100),
      side: randomSide(),
      client: _clientId,
    };
    //Placing a random order in the OrderBook
    console.log("Placing Order ...");
    console.log(order);

    // Create the order Locally
    await createOrder(
        order.symbol,
        order.quantity,
        order.price,
        order.side,
        order.client
    );
    
    //Send the Order to the other Nodes
    peerClient.map(
      "rpc_exchange",
      order,
      { timeout: 20000 },
      (err, data) => {
        if (err) {
          //console.error("#peerClient request: ", err);
        }
        console.log(data);
      }
    );
  } catch (e) {
    console.log(e);
  }
}, 10000);

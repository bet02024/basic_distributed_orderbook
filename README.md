# Orderbook

Basic distributed Orderbook example, using Grenache RPC client/server

### Install Grape:
```
npm i -g grenache-grape
```
### Setting up Grenache in your project
```
npm install --save grenache-nodejs-http
npm install --save grenache-nodejs-link
```
### Run 2  Grapes:
```
grape --dp 20001 --apw 30001 --aph 30002 --bn '127.0.0.1:20002'
grape --dp 20002 --apw 40001 --aph 40002 --bn '127.0.0.1:20001'
```

### Run multiples instances of the server/client :
```
node client.js
```

# Synchronization

The client get a copy of the OrderBook from the other nodes, the other nodes execute the trades when a new order is placed. 

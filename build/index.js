'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _events = require('events');

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

class JVC extends _events.EventEmitter {
  constructor(logger, ip, port) {
    super();
    this.logger = logger;
    this.ip = ip;
    this.port = port;
  }

  received(d) {
    if (d.length === 0) {
      return;
    }
    if (!this.acked) {
      const str = d.toString('utf8');
      if (str.startsWith('PJ_OK')) {
        this.socket.write(Buffer.from('PJREQ'));
      } else if (str.startsWith('PJACK')) {
        this.acked = true;
        this.emit('ready');
      } else if (str.startsWith('PJNAK')) {
        this.logger.info('Received NAK');
      }
      if (d.length > 5) {
        this.received(d.slice(5));
      }
    } else {
      const fullMessage = this.partial ? Buffer.concat([this.partial, d]) : d;
      delete this.partial;
      const endOf = fullMessage.indexOf(0x0A);
      if (endOf < 0) {
        this.logger.info('Partial message received', { message: fullMessage.toString('hex') });
        this.partial = fullMessage;
      } else {
        const thisMessage = fullMessage.slice(0, endOf);
        this.messageReceived(thisMessage);
        if (endOf < fullMessage.length) {
          this.received(fullMessage.slice(endOf + 1));
        }
      }
    }
  }

  messageReceived(message) {
    const header = message[0];
    if (header === 0x06) {
      this.emit('ack', message.slice(3, 5), message.slice(6));
    } else if (header === 0x40) {
      this.emit('response', message.slice(3, 5).toString('hex'), message.slice(5).toString('hex'));
    } else {
      this.logger.error('Failed to parse packet');
      this.emit('unknown', message);
    }
  }

  write(d) {
    var _this = this;

    return _asyncToGenerator(function* () {
      if (!_this.socket) {
        yield _this.connect();
      }
      _this.socket.write(d);
    })();
  }

  requestPowerState() {
    this.write(Buffer.from([0x3F, 0x89, 0x01, 0x50, 0x57, 0x0A]));
  }

  requestInputState() {
    this.write(Buffer.from([0x3F, 0x89, 0x01, 0x49, 0x50, 0x0A]));
  }

  setPowerState(on) {
    this.write(Buffer.from([0x21, 0x89, 0x01, 0x50, 0x57, on ? 0x31 : 0x30, 0x0A]));
  }

  setInputState(hdmi1) {
    this.write(Buffer.from([0x21, 0x89, 0x01, 0x49, 0x50, hdmi1 ? 0x36 : 0x37, 0x0A]));
  }

  sendCommand(cmd) {
    this.write(Buffer.from(cmd));
  }

  connect() {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      return yield new Promise(function (accept) {
        _this2.logger.info('Connecting to JVC projector');
        _this2.socket = new _net2.default.Socket();
        _this2.socket.on('error', function (e) {
          _this2.logger.error('Socket error', e);
        });
        _this2.socket.on('close', function () {
          _this2.logger.info('Socket closed');
          _this2.socket.removeAllListeners();
          delete _this2.socket;
        });
        _this2.socket.on('data', function (d) {
          return _this2.received(d);
        });
        _this2.socket.connect({
          host: _this2.ip,
          port: _this2.port || 20554
        }, function () {
          _this2.emit('connected');
          accept();
        });
      });
    })();
  }

  disconnect() {
    this.shuttingDown = true;
    this.socket.end();
    this.socket.removeAllListeners();
    delete this.socket;
  }
}
exports.default = JVC;
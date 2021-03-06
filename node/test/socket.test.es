import expect from 'must';
import socketModule from '../socket';
import EventEmitter from 'events';

describe('Module: node/socket', () => {
  let socket = new EventEmitter();
  let io     = new EventEmitter();

  it('should emit connection  exist', (done) => {
    io.on('status', (data) => {
      expect(data).to.be('ready');
      done();
    });
    socketModule(socket);
    socket.emit('connection', io);
  });
});

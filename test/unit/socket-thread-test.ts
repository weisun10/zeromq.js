import * as zmq from "../../src"

import {assert} from "chai"
import {createWorker, testProtos, uniqAddress} from "./helpers"

for (const proto of testProtos("tcp", "ipc", "inproc")) {
  describe(`socket with ${proto} in thread`, function() {
    this.slow(2000)
    this.timeout(5000)

    describe("when connected within thread", function() {
      it("should deliver messages", async function() {
        const data = {address: uniqAddress(proto)}
        const recv = await createWorker(data, async ({address}) => {
          const sockA = new zmq.Pair({linger: 0})
          const sockB = new zmq.Pair({linger: 0})
          await sockB.bind(address)
          await sockA.connect(address)
          await sockA.send(["foo", "bar"])

          return sockB.receive()
        })

        assert.deepEqual(
          ["foo", "bar"],
          recv.map(buf => Buffer.from(buf).toString()),
        )
      })
    })

    describe("when connected to thread", function() {
      it("should deliver messages", async function() {
        const address = uniqAddress(proto)

        const sockA = new zmq.Pair({linger: 0})
        await sockA.bind(address)
        sockA.send(["foo", "bar"])

        await createWorker({address}, async ({address}) => {
          const sockB = new zmq.Pair({linger: 0})
          await sockB.connect(address)
          for await (const msg of sockB) {
            await sockB.send(msg)
            return
          }
        })

        const recv = await sockA.receive()
        sockA.close()
        assert.deepEqual(
          ["foo", "bar"],
          recv.map(buf => buf.toString()),
        )
      })
    })

    describe("when connected between threads", function() {
      it("should deliver messages", async function() {
        const address = uniqAddress(proto)

        const worker1 = createWorker({address}, async ({address}) => {
          const sockA = new zmq.Pair({linger: 0})
          await sockA.bind(address)
          await sockA.send(["foo", "bar"])

          return sockA.receive()
        })

        const worker2 = createWorker({address}, async ({address}) => {
          const sockB = new zmq.Pair({linger: 0})
          await sockB.connect(address)
          for await (const msg of sockB) {
            await sockB.send(msg)
            return
          }
        })

        const [recv] = await Promise.all([worker1, worker2])
        assert.deepEqual(
          ["foo", "bar"],
          recv.map(buf => Buffer.from(buf).toString()),
        )
      })
    })
  })
}

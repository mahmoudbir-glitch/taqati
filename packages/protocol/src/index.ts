export type ModbusTransport =
  | {
      protocol: "MODBUS_RTU";
      serialPort: string;
      baudRate: number;
      dataBits: 8;
      parity: "NONE" | "EVEN" | "ODD";
      stopBits: 1 | 2;
      slaveId: number;
    }
  | {
      protocol: "MODBUS_TCP";
      host: string;
      tcpPort: number;
      slaveId: number;
    };

export interface InverterDriver {
  readonly manufacturer: string;
  readonly model?: string;
  connect(transport: ModbusTransport): Promise<void>;
  readTelemetry(): Promise<Record<string, number | string | null>>;
  disconnect(): Promise<void>;
}

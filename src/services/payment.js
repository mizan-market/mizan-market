export class PaymentProvider {
  constructor(config={}){this.config=config}
  async createPayment(){throw new Error('Payment provider not configured')}
  async verifyPayment(){throw new Error('Payment verification not configured')}
}
export class PendingGatewayProvider extends PaymentProvider {
  async createPayment(){return {status:'pending',message:'Real payment gateway is not connected yet.'}}
  async verifyPayment(){return {verified:false,reason:'No real payment gateway is configured.'}}
}
export function getPaymentProvider(config={}){return new PendingGatewayProvider(config)}

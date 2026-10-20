import {describe,it,expect} from 'vitest'
import {encodePaymentScreenshot,validatePaymentScreenshot} from '../src/domain/payment-screenshot'
describe('付款截图',()=>{it('拒绝非图片和超过 5MB 的截图，读取结果可随付款提交',async()=>{
  expect(()=>validatePaymentScreenshot({type:'image/svg+xml',size:12})).toThrow('JPG')
  expect(()=>validatePaymentScreenshot({type:'image/png',size:5*1024*1024+1})).toThrow('5 MB')
  expect(()=>validatePaymentScreenshot({type:'image/png',size:0})).toThrow('非空')
  const result=await encodePaymentScreenshot(new File([new Uint8Array([137,80,78,71])],'proof.png',{type:'image/png'}))
  expect(result).toEqual({contentType:'image/png',data:'iVBORw=='})
})})

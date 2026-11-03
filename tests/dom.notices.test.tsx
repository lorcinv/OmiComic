import {act,fireEvent,render,screen}from'@testing-library/react';
import {afterEach,beforeEach,expect,it,vi}from'vitest';
import NoticeStack from '../src/components/NoticeStack';
import{showNotice,dismissNotice,getNoticeSnapshot}from'../src/notifications';
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{for(const item of getNoticeSnapshot())dismissNotice(item.id);vi.useRealTimers();});
const notify=(text:string,duration=1000)=>showNotice({owner:'test',text,kind:'info',duration,closeLabel:'关闭'});
it('starts each notice clock only after the previous one leaves the front',()=>{
  render(<NoticeStack/>);act(()=>notify('第一条'));act(()=>vi.advanceTimersByTime(500));act(()=>notify('第二条'));
  act(()=>vi.advanceTimersByTime(500));expect(screen.getByRole('status').textContent).toContain('第二条');
  act(()=>vi.advanceTimersByTime(999));expect(screen.getByRole('status').textContent).toContain('第二条');
  act(()=>vi.advanceTimersByTime(1));expect(screen.queryByRole('status')).toBeNull();
});
it('keeps queued notices behind a persistent error and starts their timeout after manual dismissal',()=>{
  render(<NoticeStack/>);act(()=>{showNotice({owner:'error',text:'失效资源',kind:'error',duration:0,closeLabel:'关闭错误提示'});notify('目录已加入');notify('后续提示');});
  act(()=>vi.advanceTimersByTime(10000));expect(screen.getByRole('alert').textContent).toContain('失效资源');expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getByLabelText('关闭错误提示'));expect(screen.getByRole('status').textContent).toContain('目录已加入');
  act(()=>vi.advanceTimersByTime(1000));expect(screen.getByRole('status').textContent).toContain('后续提示');
});
it('does not restart the front timeout when more notices arrive',()=>{
  render(<NoticeStack/>);act(()=>notify('第一条'));act(()=>vi.advanceTimersByTime(900));act(()=>notify('第二条'));
  act(()=>vi.advanceTimersByTime(100));expect(screen.getByRole('status').textContent).toContain('第二条');
});

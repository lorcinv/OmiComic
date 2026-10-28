const paths = {
  top: 'M12 20V4m-6 6 6-6 6 6',
  first: 'M5 5v14m13-14-7 7 7 7',
  previous: 'm15 5-7 7 7 7',
  next: 'm9 5 7 7-7 7',
  last: 'M19 5v14M6 5l7 7-7 7',
  clear: 'M5 5h14v14H5zM8 12h8',
};
export default function LibraryPageIcon({ name }: { name: keyof typeof paths }) {
  return <svg className="app-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}

export const assetUrl=name=>'./assets/'+name+'.webp';
export async function seasonData(name){
  const response=await fetch('./season/'+name+'.json');
  if(!response.ok)throw Error('Season resource unavailable: '+name);
  return response.json();
}

/* WebGL3D Pipeline v1.0.0 — reusable WebGL2 baseline, no external dependency. */
(function (global) {
  'use strict';
  const EPS = 1e-7;
  const Mat4 = {
    identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
    multiply(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
      }
      return o;
    },
    perspective(fov, aspect, near, far) {
      const f=1/Math.tan(fov/2), nf=1/(near-far);
      return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
    },
    lookAt(eye, target, up) {
      let zx=eye[0]-target[0],zy=eye[1]-target[1],zz=eye[2]-target[2],l=Math.hypot(zx,zy,zz)||1; zx/=l;zy/=l;zz/=l;
      let xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx;l=Math.hypot(xx,xy,xz)||1;xx/=l;xy/=l;xz/=l;
      const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;
      return new Float32Array([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
        -(xx*eye[0]+xy*eye[1]+xz*eye[2]),-(yx*eye[0]+yy*eye[1]+yz*eye[2]),-(zx*eye[0]+zy*eye[1]+zz*eye[2]),1]);
    },
    translation(x,y,z) { const m=Mat4.identity();m[12]=x;m[13]=y;m[14]=z;return m; },
    scale(x,y,z) { return new Float32Array([x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]); },
    rotationX(a) { const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); },
    rotationY(a) { const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); },
    rotationZ(a) { const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); },
    trs(position=[0,0,0], rotation=[0,0,0], scale=[1,1,1]) {
      return Mat4.multiply(Mat4.translation(...position),Mat4.multiply(Mat4.rotationZ(rotation[2]),Mat4.multiply(Mat4.rotationY(rotation[1]),Mat4.multiply(Mat4.rotationX(rotation[0]),Mat4.scale(...scale)))));
    },
    transformPoint(m,p) { return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]]; },
    billboard(position,eye,scale=[1,1,1]) { return Mat4.trs(position,[0,Math.atan2(eye[0]-position[0],eye[2]-position[2]),0],scale); }
  };
  function normalMatrix(m) {
    const a00=m[0],a01=m[4],a02=m[8],a10=m[1],a11=m[5],a12=m[9],a20=m[2],a21=m[6],a22=m[10];
    const b01=a22*a11-a12*a21,b11=-a22*a10+a12*a20,b21=a21*a10-a11*a20;let d=a00*b01+a01*b11+a02*b21;d=Math.abs(d)<EPS?1:1/d;
    const i=[b01*d,(-a22*a01+a02*a21)*d,(a12*a01-a02*a11)*d,b11*d,(a22*a00-a02*a20)*d,(-a12*a00+a02*a10)*d,b21*d,(-a21*a00+a01*a20)*d,(a11*a00-a01*a10)*d];
    return new Float32Array([i[0],i[3],i[6],i[1],i[4],i[7],i[2],i[5],i[8]]);
  }
  function compile(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  function link(gl,vs,fs){const p=gl.createProgram();gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
  function computeNormals(pos,idx){const n=new Float32Array(pos.length);for(let i=0;i<idx.length;i+=3){const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3,ab=[pos[b]-pos[a],pos[b+1]-pos[a+1],pos[b+2]-pos[a+2]],ac=[pos[c]-pos[a],pos[c+1]-pos[a+1],pos[c+2]-pos[a+2]],x=ab[1]*ac[2]-ab[2]*ac[1],y=ab[2]*ac[0]-ab[0]*ac[2],z=ab[0]*ac[1]-ab[1]*ac[0];for(const k of [a,b,c]){n[k]+=x;n[k+1]+=y;n[k+2]+=z;}}for(let i=0;i<n.length;i+=3){const l=Math.hypot(n[i],n[i+1],n[i+2])||1;n[i]/=l;n[i+1]/=l;n[i+2]/=l;}return n;}
  function validateGeometry(g){const errors=[],warnings=[],p=g.positions||[],count=p.length/3,idx=g.indices||Array.from({length:count},(_,i)=>i);if(!p.length||p.length%3)errors.push('positions 必须是非空的 xyz 数组');if(Array.from(p).some(v=>!Number.isFinite(v)))errors.push('positions 存在非有限数');if(idx.length%3)errors.push('indices 必须按三角形成组');if(Array.from(idx).some(i=>i<0||i>=count||!Number.isInteger(i)))errors.push('indices 越界或非整数');let bad=0;for(let i=0;i+2<idx.length;i+=3){const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3,abx=p[b]-p[a],aby=p[b+1]-p[a+1],abz=p[b+2]-p[a+2],acx=p[c]-p[a],acy=p[c+1]-p[a+1],acz=p[c+2]-p[a+2],x=aby*acz-abz*acy,y=abz*acx-abx*acz,z=abx*acy-aby*acx;if(x*x+y*y+z*z<EPS)bad++;}if(bad)warnings.push(`${bad} 个退化三角形`);return {ok:!errors.length,errors,warnings,vertexCount:count,triangleCount:idx.length/3};}
  const VS=`#version 300 es
  precision highp float;layout(location=0)in vec3 aPosition;layout(location=1)in vec3 aNormal;layout(location=2)in vec2 aUV;
  uniform mat4 uModel,uView,uProjection;uniform mat3 uNormalMatrix;out vec3 vNormal;out vec2 vUV;out float vDepth;
  void main(){vec4 world=uModel*vec4(aPosition,1.0);vec4 view=uView*world;gl_Position=uProjection*view;vNormal=normalize(uNormalMatrix*aNormal);vUV=aUV;vDepth=-view.z;}`;
  const FS=`#version 300 es
  precision highp float;in vec3 vNormal;in vec2 vUV;in float vDepth;out vec4 outColor;uniform vec4 uColor;uniform sampler2D uTexture;uniform bool uUseTexture,uUnlit;uniform int uAlphaMode,uDebugMode;uniform float uAlphaCutoff,uFar;uniform vec3 uLightDirection,uLightColor,uAmbient;
  void main(){vec4 base=uColor*(uUseTexture?texture(uTexture,vUV):vec4(1.0));if(uAlphaMode==1&&base.a<uAlphaCutoff)discard;vec3 n=normalize(vNormal);float l=max(dot(n,normalize(-uLightDirection)),0.0);vec3 rgb=uUnlit?base.rgb:base.rgb*(uAmbient+uLightColor*l);if(uDebugMode==1)rgb=n*.5+.5;else if(uDebugMode==2)rgb=vec3(clamp(vDepth/uFar,0.0,1.0));outColor=vec4(rgb,base.a);}`;
  const PVS=`#version 300 es
  precision highp float;out vec2 vUV;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.0-1.0,0,1);}`;
  const PFS=`#version 300 es
  precision highp float;in vec2 vUV;out vec4 outColor;uniform sampler2D uScene;uniform vec2 uResolution;uniform float uExposure,uContrast,uSaturation,uVignette,uGrain,uChroma,uFrame;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+uFrame*.017)*43758.5453);}void main(){vec2 uv=vUV,d=uv-.5;float ca=uChroma/max(uResolution.x,1.0);vec3 c=vec3(texture(uScene,uv+d*ca).r,texture(uScene,uv).g,texture(uScene,uv-d*ca).b)*uExposure;c=(c-.5)*uContrast+.5;float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,uSaturation);c*=1.0-uVignette*smoothstep(.18,.72,dot(d,d));c+=(hash(gl_FragCoord.xy)-.5)*uGrain;outColor=vec4(clamp(c,0.0,1.0),1.0);}`;
  function create(canvas,opt={}){
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:opt.antialias!==false,premultipliedAlpha:false,preserveDrawingBuffer:!!opt.preserveDrawingBuffer});if(!gl)throw new Error('WebGL2 不可用');
    const sp=link(gl,VS,FS),pp=link(gl,PVS,PFS),U={},PU={};for(const n of ['uModel','uView','uProjection','uNormalMatrix','uColor','uTexture','uUseTexture','uUnlit','uAlphaMode','uAlphaCutoff','uFar','uLightDirection','uLightColor','uAmbient','uDebugMode'])U[n]=gl.getUniformLocation(sp,n);for(const n of ['uScene','uResolution','uExposure','uContrast','uSaturation','uVignette','uGrain','uChroma','uFrame'])PU[n]=gl.getUniformLocation(pp,n);
    const state={camera:{eye:[5,4,7],target:[0,1,0],up:[0,1,0],fov:Math.PI/3,near:.1,far:200},light:{direction:[.4,-1,.25],color:[1,1,.95],ambient:[.2,.22,.28]},debugMode:0,post:{exposure:1,contrast:1,saturation:1,vignette:.18,grain:0,chroma:0},frame:0,glErrors:[]};let colorTex,depthTex,fbo,w=0,h=0;
    const whiteTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,whiteTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    function checkGl(stage){let code;while((code=gl.getError())!==gl.NO_ERROR)state.glErrors.push({stage,code});}
    function resize(force=false){const dpr=Math.min(opt.maxDpr||2,global.devicePixelRatio||1),nw=Math.max(1,Math.round(canvas.clientWidth*dpr)),nh=Math.max(1,Math.round(canvas.clientHeight*dpr));if(!force&&nw===w&&nh===h)return false;w=nw;h=nh;canvas.width=w;canvas.height=h;if(colorTex)gl.deleteTexture(colorTex);if(depthTex)gl.deleteTexture(depthTex);if(fbo)gl.deleteFramebuffer(fbo);colorTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,colorTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);depthTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,depthTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,colorTex,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depthTex,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('场景帧缓冲不完整');gl.bindFramebuffer(gl.FRAMEBUFFER,null);return true;}
    function createMesh(g){const check=validateGeometry(g);if(!check.ok)throw new Error(check.errors.join('；'));const p=new Float32Array(g.positions),raw=g.indices||Array.from({length:p.length/3},(_,i)=>i),idx=p.length/3>65535?new Uint32Array(raw):new Uint16Array(raw),n=g.normals?new Float32Array(g.normals):computeNormals(p,idx),uv=new Float32Array(g.uvs||new Array(p.length/3*2).fill(0)),vao=gl.createVertexArray();gl.bindVertexArray(vao);function attr(loc,data,size){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);}attr(0,p,3);attr(1,n,3);attr(2,uv,2);const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);gl.bindVertexArray(null);const center=[0,0,0];for(let i=0;i<p.length;i+=3){center[0]+=p[i];center[1]+=p[i+1];center[2]+=p[i+2];}center[0]/=p.length/3;center[1]/=p.length/3;center[2]/=p.length/3;return{vao,count:idx.length,indexType:idx instanceof Uint32Array?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,center,validation:check};}
    function createTexture(source,o={}){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,o.flipY!==false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,o.pixelated?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,o.pixelated?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
    function material(o={}){return{color:o.color||[1,1,1,1],texture:o.texture||null,alphaMode:o.alphaMode||'opaque',alphaCutoff:o.alphaCutoff??.5,doubleSided:!!o.doubleSided,depthWrite:o.depthWrite!==false,unlit:!!o.unlit};}
    function depth(item){const p=Mat4.transformPoint(item.model||Mat4.identity(),item.mesh.center),e=state.camera.eye;return Math.hypot(p[0]-e[0],p[1]-e[1],p[2]-e[2]);}
    function draw(item,view,projection){const m=item.model||Mat4.identity(),mat=item.material||material();gl.bindVertexArray(item.mesh.vao);gl.uniformMatrix4fv(U.uModel,false,m);gl.uniformMatrix4fv(U.uView,false,view);gl.uniformMatrix4fv(U.uProjection,false,projection);gl.uniformMatrix3fv(U.uNormalMatrix,false,normalMatrix(m));gl.uniform4fv(U.uColor,mat.color);gl.uniform1i(U.uUseTexture,!!mat.texture);gl.uniform1i(U.uUnlit,mat.unlit);gl.uniform1i(U.uAlphaMode,mat.alphaMode==='mask'?1:mat.alphaMode==='blend'?2:0);gl.uniform1f(U.uAlphaCutoff,mat.alphaCutoff);gl.uniform1i(U.uDebugMode,state.debugMode);gl.uniform1f(U.uFar,state.camera.far);gl.depthMask(mat.alphaMode==='blend'?!!mat.depthWrite:true);if(mat.doubleSided)gl.disable(gl.CULL_FACE);else gl.enable(gl.CULL_FACE);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,mat.texture||whiteTex);gl.uniform1i(U.uTexture,0);gl.drawElements(gl.TRIANGLES,item.mesh.count,item.mesh.indexType,0);}
    function render(items,override={}){resize();Object.assign(state,override);const cam=state.camera,view=Mat4.lookAt(cam.eye,cam.target,cam.up),projection=Mat4.perspective(cam.fov,w/h,cam.near,cam.far);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,w,h);gl.clearColor(...(opt.clearColor||[.02,.025,.04,1]));gl.clearDepth(1);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);gl.disable(gl.BLEND);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(sp);gl.uniform3fv(U.uLightDirection,state.light.direction);gl.uniform3fv(U.uLightColor,state.light.color);gl.uniform3fv(U.uAmbient,state.light.ambient);checkGl('scene-setup');const opaque=items.filter(i=>(i.material?.alphaMode||'opaque')!=='blend').sort((a,b)=>depth(a)-depth(b)),transparent=items.filter(i=>i.material?.alphaMode==='blend').sort((a,b)=>depth(b)-depth(a));for(const i of opaque){draw(i,view,projection);checkGl('opaque:'+String(i.name||'unnamed'));}gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);for(const i of transparent){draw(i,view,projection);checkGl('transparent:'+String(i.name||'unnamed'));}gl.disable(gl.BLEND);gl.depthMask(true);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.useProgram(pp);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,colorTex);gl.uniform1i(PU.uScene,0);gl.uniform2f(PU.uResolution,w,h);const p=state.post;gl.uniform1f(PU.uExposure,p.exposure??1);gl.uniform1f(PU.uContrast,p.contrast??1);gl.uniform1f(PU.uSaturation,p.saturation??1);gl.uniform1f(PU.uVignette,p.vignette??0);gl.uniform1f(PU.uGrain,p.grain??0);gl.uniform1f(PU.uChroma,p.chroma??0);gl.uniform1f(PU.uFrame,state.frame||0);gl.drawArrays(gl.TRIANGLES,0,3);checkGl('post-pass');}
    resize(true);return{gl,state,Mat4,createMesh,createTexture,createMaterial:material,render,resize,validateGeometry};
  }
  const Geometry={
    box(w=1,h=1,d=1){const x=w/2,y=h/2,z=d/2;return{positions:[-x,-y,z,x,-y,z,x,y,z,-x,y,z,x,-y,-z,-x,-y,-z,-x,y,-z,x,y,-z,-x,-y,-z,-x,-y,z,-x,y,z,-x,y,-z,x,-y,z,x,-y,-z,x,y,-z,x,y,z,-x,y,z,x,y,z,x,y,-z,-x,y,-z,-x,-y,-z,x,-y,-z,x,-y,z,-x,-y,z],uvs:Array(6).fill([0,0,1,0,1,1,0,1]).flat(),indices:Array.from({length:6},(_,f)=>[f*4,f*4+1,f*4+2,f*4,f*4+2,f*4+3]).flat()};},
    plane(w=1,h=1){return{positions:[-w/2,-h/2,0,w/2,-h/2,0,w/2,h/2,0,-w/2,h/2,0],normals:[0,0,1,0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,1,1,0,1],indices:[0,1,2,0,2,3]};},
    ground(w=1,d=1){return{positions:[-w/2,0,-d/2,-w/2,0,d/2,w/2,0,d/2,w/2,0,-d/2],normals:[0,1,0,0,1,0,0,1,0,0,1,0],uvs:[0,0,0,1,1,1,1,0],indices:[0,1,2,0,2,3]};}
  };
  global.GL3D={version:'1.0.0',create,Mat4,Geometry,validateGeometry};
})(window);

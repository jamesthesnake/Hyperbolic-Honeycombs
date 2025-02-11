#define USE_IQ_CLOUDS
#define KN_VOLUMETRIC
#define USE_EIFFIE_SHADOW
#define MULTI_SAMPLE_AO
#define providesInit
#include "DE-Kn2cr11.frag"

#group BallPacking-Settings
uniform int euclideanTriangleType; slider[0,1,2]
uniform vec3 dihedralAngles0_234; slider[(1,1,1),(3,2,7),(20,20,20)]
uniform vec3 dihedralAngles1_234; slider[(1,1,1),(3,2,7),(20,20,20)]
uniform float dihedralAngle0_1; slider[1,4,20]
uniform vec4 isRealBall; slider[(0,0,0,0),(1,1,0,0),(1,1,1,1)]
uniform int Iterations; slider[1,50,500]


#define inf           1.0
#define L2(x)         dot(x, x)

#define s2 1.41421356
#define s3 1.73205081

float section_height;

float dihedral(float x) {
    return x == inf ? 1. : cos(PI / x);
}

vec3 dihedral(vec3 v) {
    return vec3(dihedral(v.x), dihedral(v.y), dihedral(v.z));
}

struct Ball {
    bool isplane;
    vec3 n;
    float r;
    bool invert;
    bool isRealBall;
};


// coclusters are mirror balls, they corresponde to root vectors (space-like)
Ball[5] coclusters;
// clusters are real balls, they corresponde to space-like weight vectors
Ball[5] clusters;

Ball defaultBall() {
    return Ball(false, vec3(0, 0, -1), 0., false, false);
}

// Distance from a point to a ball
float sdistanceToBall(vec3 p, Ball B) {
    if (B.isplane) {
        float k = dot(vec4(p, 1), vec4(B.n, B.r));
        return k;
    }
    else
        return length(p - B.n) - B.r;
}

Ball from_plane(vec3 n, float d) {
    return Ball(true, n, d, false, false);
}

Ball from_sphere(vec3 cen, float r) {
    return Ball(false, cen, r, false, false);
}

void invertBall(inout Ball B) {
    B.invert = !B.invert;
}

bool try_reflect(inout vec3 p,
                 in Ball B,
                 inout float scale,
                 inout vec4 orb) {
    if (B.isplane) {
        float k = dot(vec4(p, 1), vec4(B.n, B.r));
        if (k >= 0.)
            return true;
        p -= 2. * k  * B.n;
        return false;
    }
    else {
        vec3 cen = B.n;
        float r = B.r;
        vec3 q = p - cen;
        float d2 = dot(q, q);
        float k = (r * r) / d2;
        if ( (k < 1.0 && B.invert) || (k > 1. && !B.invert) )
            return true;

        orb = min(orb, vec4(abs(p), d2));
        scale*=k;
        p = k * q + cen;
        return false;
    }
}

Ball solveBall(mat3 M, vec3 b) {
    vec3 p = b * inverse(M);
    return from_sphere(vec3(p.xy, 0.), p.z);
}

Ball solveBall(vec2 P, Ball B0, Ball B1) {
    if (B0.isplane) {
        float z = B0.r;
        vec3 cen = vec3(P, z);
        float R = sqrt(L2(cen - B1.n) - B1.r*B1.r);
        return from_sphere(cen, R);
    }
    else {
        float r1 = B1.r;
        float r0 = B0.r;
        float z0 = B0.n.z;
        float k0 = L2(P - B0.n.xy);
        float k1 = L2(P - B1.n.xy);
        float z = (r1*r1 - r0*r0 + z0*z0 + k0 - k1) / (2.*z0);
        float R = sqrt(k1 + z*z - r1*r1);
        return from_sphere(vec3(P, z), R);
    }
}

void init() {

    mat3 M0, M1;
    vec3 b;
    Ball B0, B1, B2, B3, B4;
    vec3 t0 = dihedral(dihedralAngles0_234);
    vec3 t1 = dihedral(dihedralAngles1_234);
    float t01 = dihedral(dihedralAngle0_1);
    // A, B, C are the vertices of the triangle formed by mirror plane v2, v3, v4 and z=0 plane
    vec2 A, B, C;

    // the 236 case
    if (euclideanTriangleType == 0) {
        A = vec2(0, 0), B = vec2(0, s3), C = vec2(1, 0);
        B2 = from_plane(vec3(1, 0, 0), 0.);
        B3 = from_plane(vec3(-s3/2., -0.5, 0), s3/2.);
        B4 = from_plane(vec3(0, 1, 0), 0.);
        M1 = mat3(vec3(1, 0, -t1.x), vec3(s3/2., 0.5, t1.y), vec3(0, 1, -t1.z));
        M0 = mat3(vec3(1, 0, -t0.x), vec3(s3/2., 0.5, t0.y), vec3(0, 1, -t0.z));
        b = vec3(0, s3/2., 0);
    }

    // the 244 case
    else if (euclideanTriangleType == 1) {
        A = vec2(0, 0), B = vec2(0, 1), C = vec2(1, 0);
        B2 = from_plane(vec3(1, 0, 0), 0.);
        B3 = from_plane(vec3(-s2/2., -s2/2., 0), s2/2.);
        B4 = from_plane(vec3(0, 1, 0), 0.);
        M1 = mat3(vec3(1, 0, -t1.x), vec3(1./s2, 1./s2, t1.y), vec3(0, 1, -t1.z));
        M0 = mat3(vec3(1, 0, -t0.x), vec3(1./s2, 1./s2, t0.y), vec3(0, 1, -t0.z));
        b = vec3(0, s2/2., 0);
    }

    // the 333 case
    else {
        A = vec2(-1, 0), B = vec2(0, s3), C = vec2(1, 0);
        B2 = from_plane(vec3(s3/2., -.5, 0), s3/2.);
        B3 = from_plane(vec3(-s3/2., -.5, 0), s3/2.);
        B4 = from_plane(vec3(0, 1, 0), 0.);
        M1 = mat3(vec3(-s3/2., 0.5, t1.x), vec3(s3/2., .5, t1.y), vec3(0, 1, -t1.z));
        M0 = mat3(vec3(-s3/2., 0.5, t0.x), vec3(s3/2., .5, t0.y), vec3(0, 1, -t0.z));
        b = vec3(s3, s3, 0)/2.;
    }

    // now we solve the virtual ball B1, this can't be a plane
    B1 = solveBall(M1, b);
    invertBall(B1);

    // now we solve the virtual ball B0, this can be either a plane or a sphere
    // this depends on if all entries in dihedralAngles0 are all 2
    if (dot(dihedralAngles0_234, vec3(1)) == 6.) {
        B0 = from_plane(vec3(0, 0, -1), B1.r*t01);
    }
    else {
        B0 = solveBall(M0, b);
        float r1 = B1.r, r0 = B0.r;
        B0.n.z = sqrt(r0*r0 + r1*r1 + 2.*r0*r1*t01 - L2(B1.n.xy - B0.n.xy));
        invertBall(B0);
    }
    coclusters = Ball[5] (B0, B1, B2, B3, B4);

    section_height = B0.isplane ? 2.*B0.r : B0.n.z;

    //now we process the real balls
    for (int k = 0; k < 5; k++)
        clusters[k] = defaultBall();

    if (isRealBall.x == 1.) {
        clusters[1] = from_plane(vec3(0, 0, -1.), B0.n.z);
        clusters[1].isRealBall = true;
    }
    if (isRealBall.y == 1.) {
        clusters[2] = solveBall(C, B0, B1);
        clusters[2].isRealBall = true;
    }
    if (isRealBall.z== 1.) {
        clusters[3] = solveBall(A, B0, B1);
        clusters[3].isRealBall = true;
    }

    if (isRealBall.w==1.) {
        clusters[4] = solveBall(B, B0, B1);
        clusters[4].isRealBall = true;
    }
}


float map(inout vec3 p, inout float scale, inout vec4 orb) {
    int Iterations = 200;
    for (int i = 0; i < Iterations; i++) {
        bool cond = true;
        for (int k = 0; k < 5; k++) {
            cond = cond && try_reflect(p, coclusters[k], scale, orb);
        }
        if (cond)
            break;
    }

    float d = abs(p.z);
    for (int j = 1; j < 5; j++) {
        if (clusters[j].isRealBall) {
            d = min(abs(sdistanceToBall(p, clusters[j])), d);
        }
    }
    return d;
}


float DE(vec3 p) {
    float DEfactor=1.;
    float d = map(p, DEfactor, orbitTrap);

    //Call basic shape and scale its DE
    return 0.25*d/DEfactor;

}


#preset default
AutoFocus = true
FOV = 0.685022
Eye = 4.93725,0.790201,2.80223
Target = 4.96848,-4.56638,-6.24156
UpLock = false
Up = 0,0,1
AutoFocus = false
FocalPlane = 2.92592
Aperture = 0
InFocusAWidth = 1
DofCorrect = true
ApertureNbrSides = 5
ApertureRot = 0
ApStarShaped = false
Gamma = 1
ToneMapping = 5
Exposure = 1
Brightness = 1
Contrast = 1
Saturation = 1
GaussianWeight = 1
AntiAliasScale = 1.5
Bloom = false
BloomIntensity = 0.733096
BloomPow = 5.22093
BloomTaps = 23
BloomStrong = 6.57901
DepthToAlpha = true
Detail = -4.03165
RefineSteps = 5
FudgeFactor = 0.235639
MaxRaySteps = 1200
MaxDistance = 200
Dither = 0.5
NormalBackStep = 0.3875
DetailAO = -1.96825
coneApertureAO = 0.56566
maxIterAO = 19
FudgeAO = 0.349943
AO_ambient = 1
AO_camlight = 0.97638
AO_pointlight = 0.449594
AoCorrect = 0.7281
Specular = 0.08918
SpecularExp = 30.435
CamLight = 0.364706,0.364706,0.364706,0.28169
AmbiantLight = 0.709804,0.709804,0.709804,0.95652
Reflection = 0.192157,0.192157,0.192157
ReflectionsNumber = 1
SpotGlow = false
SpotLight = 1,1,1,0.4124
LightPos = 2.7888,2.2138,-2.061
LightSize = 0
LightFallOff = 0.2314
LightGlowRad = 0
LightGlowExp = 0
HardShadow = 1
ShadowSoft = 11.1712
ShadowBlur = 0
perf = false
SSS = false
sss1 = 0.1
sss2 = 0.5
BaseColor = 0.701961,0.701961,0.701961
OrbitStrength = 0.7751
X = 0.25098,0.505882,0.756863,1
Y = 0.392157,0.392157,0.584314,1
Z = 0.603922,0.164706,0.776471,1
R = 0.262745,0.482353,1,0.29412
BackgroundColor = 0.270588,0.403922,0.6
GradientBackground = 0
CycleColors = true
Cycles = 1.66106
EnableFloor = false
FloorNormal = 0,0,1
FloorHeight = 0
FloorColor = 1,1,1
HF_Fallof = 0.187344
HF_Const = 0.05333
HF_Intensity = 0
HF_Dir = 0,0,1
HF_Offset = 0
HF_Color = 0.564706,0.752941,0.878431,1
HF_Scatter = 10
HF_Anisotropy = 0.168627,0.168627,0.168627
HF_FogIter = 2
HF_CastShadow = true
EnCloudsDir = true NotLocked
Clouds_Dir = 0.273574,-0.720605,-0.780451 NotLocked
CloudScale = 1 NotLocked
CloudFlatness = 0 NotLocked
CloudTops = 1 NotLocked
CloudBase = -1 NotLocked
CloudDensity = 0.484136 NotLocked
CloudRoughness = 1 NotLocked
CloudContrast = 1 NotLocked
CloudColor = 0.65,0.68,0.7 NotLocked
CloudColor2 = 0.07,0.17,0.24 NotLocked
SunLightColor = 0.7,0.5,0.3 NotLocked
Cloudvar1 = 0.99 NotLocked
Cloudvar2 = 1 NotLocked
CloudIter = 3 NotLocked
CloudBgMix = 1 NotLocked
euclideanTriangleType = 1
dihedralAngles0_234 = 3,2,7
dihedralAngles1_234 = 3,2,7
dihedralAngle0_1 = 4
isRealBall = 0,0,0,0
Iterations = 246
#endpreset


#preset 333-pseudoKleinian-like
AutoFocus = false
FOV = 0.7
Eye = 5.6304,-0.403237,0.692656
Target = 9.07877,-9.34463,-2.66041
UpLock = false
Up = 0,0,1
AutoFocus = false
FocalPlane = 1
Aperture = 0.01
InFocusAWidth = 1
DofCorrect = true
ApertureNbrSides = 5
ApertureRot = 0
ApStarShaped = true
Gamma = 1
ToneMapping = 5
Exposure = 1
Brightness = 1
Contrast = 1
Saturation = 1
GaussianWeight = 1
AntiAliasScale = 1.5
Bloom = true
BloomIntensity = 0.733096
BloomPow = 5.22093
BloomTaps = 23
BloomStrong = 6.57901
DepthToAlpha = true
Detail = -4
RefineSteps = 4
FudgeFactor = 1
MaxRaySteps = 1200
MaxDistance = 300
Dither = 0.5
NormalBackStep = 30.6125
DetailAO = -1.96825
coneApertureAO = 0.378985
maxIterAO = 19
FudgeAO = 0.349943
AO_ambient = 1
AO_camlight = 1.59217
AO_pointlight = 0.449594
AoCorrect = 0.7281
Specular = 0.4
SpecularExp = 178.26
CamLight = 1,0.945098,0.898039,0.28169
AmbiantLight = 1,0.972549,0.917647,0.95652
Reflection = 0.352941,0.352941,0.352941
ReflectionsNumber = 1
SpotGlow = false
SpotLight = 1,0.901961,0.827451,0.73438
LightPos = 10,0.6502,2.6654
LightSize = 0
LightFallOff = 0.38016
LightGlowRad = 0
LightGlowExp = 0
HardShadow = 1
ShadowSoft = 19.0118
ShadowBlur = 0
perf = false
SSS = false
sss1 = 0.1
sss2 = 0.5
BaseColor = 0.666667,0.666667,0.498039
OrbitStrength = 0
X = 0.666667,1,0,1
Y = 1,0.533333,0,1
Z = 0.603922,0.164706,0.776471,1
R = 0.262745,0.482353,1,0.29412
BackgroundColor = 0.270588,0.403922,0.6
GradientBackground = 0
CycleColors = true
Cycles = 0.1
EnableFloor = false
FloorNormal = 0,0,1
FloorHeight = -4.5349
FloorColor = 0.533333,0.533333,0.533333
HF_Fallof = 0.187344
HF_Const = 0.05333
HF_Intensity = 0
HF_Dir = 0,0,1
HF_Offset = 0
HF_Color = 1,1,1,0.83607
HF_Scatter = 10
HF_Anisotropy = 0.133333,0.00784314,0
HF_FogIter = 2
HF_CastShadow = true
EnCloudsDir = true NotLocked
Clouds_Dir = 0.57357,-0.720605,0.78045 NotLocked
CloudScale = 4 NotLocked
CloudFlatness = 0 NotLocked
CloudTops = 1 NotLocked
CloudBase = -1 NotLocked
CloudDensity = 0.484136 NotLocked
CloudRoughness = 1 NotLocked
CloudContrast = 1 NotLocked
CloudColor = 0.65,0.68,0.7 NotLocked
CloudColor2 = 0.07,0.17,0.24 NotLocked
SunLightColor = 0.7,0.5,0.3 NotLocked
Cloudvar1 = 0.99 NotLocked
Cloudvar2 = 1 NotLocked
CloudIter = 3 NotLocked
CloudBgMix = 1 NotLocked
euclideanTriangleType = 2
dihedralAngles0_234 = 2,2,4
dihedralAngles1_234 = 2,2,1
dihedralAngle0_1 = 1
isRealBall = 1,0,0,0
Iterations = 246
#endpreset



#preset 333-237-236-7
AutoFocus = false
FOV = 0.685022
Eye = 4.93123,0.221804,0.977257
Target = 4.52934,-9.42281,-2.16962
UpLock = false
Up = -0.0105119,-0.280342,0.86054
AutoFocus = false
FocalPlane = 1
Aperture = 0.003
InFocusAWidth = 1
DofCorrect = true
ApertureNbrSides = 5
ApertureRot = 0
ApStarShaped = true
Gamma = 1
ToneMapping = 5
Exposure = 1
Brightness = 1
Contrast = 1
Saturation = 1
GaussianWeight = 1
AntiAliasScale = 1.5
Bloom = true
BloomIntensity = 0.733096
BloomPow = 5.22093
BloomTaps = 23
BloomStrong = 6.57901
DepthToAlpha = true
Detail = -3.5
RefineSteps = 4
FudgeFactor = 0.235639
MaxRaySteps = 1200
MaxDistance = 200
Dither = 0.5
NormalBackStep = 30.6125
DetailAO = -1.96825
coneApertureAO = 0.378985
maxIterAO = 19
FudgeAO = 0.349943
AO_ambient = 1
AO_camlight = 1.59217
AO_pointlight = 0.449594
AoCorrect = 0.7281
Specular = 0.4
SpecularExp = 178.26
CamLight = 1,0.945098,0.898039,0.28169
AmbiantLight = 1,0.972549,0.917647,0.95652
Reflection = 0.352941,0.352941,0.352941
ReflectionsNumber = 1
SpotGlow = false
SpotLight = 1,0.901961,0.827451,0.73438
LightPos = 2.7888,-0.6502,-1.6654
LightSize = 0
LightFallOff = 0.38016
LightGlowRad = 0
LightGlowExp = 0
HardShadow = 1
ShadowSoft = 19.0118
ShadowBlur = 0
perf = false
SSS = false
sss1 = 0.1
sss2 = 0.5
BaseColor = 0.776471,0.776471,0.776471
OrbitStrength = 0.875
X = 0,1,0.164706,1
Y = 1,0.533333,0,1
Z = 0.603922,0.164706,0.776471,1
R = 0.262745,0.482353,1,0.29412
BackgroundColor = 0.270588,0.403922,0.6
GradientBackground = 0
CycleColors = false
Cycles = 0.1
EnableFloor = false
FloorNormal = 0,0,1
FloorHeight = 0
FloorColor = 1,1,1
HF_Fallof = 0.187344
HF_Const = 0.05333
HF_Intensity = 0
HF_Dir = 0,0,1
HF_Offset = 0
HF_Color = 0.564706,0.752941,0.878431,1
HF_Scatter = 10
HF_Anisotropy = 0.133333,0.00784314,0
HF_FogIter = 1
HF_CastShadow = true
EnCloudsDir = true NotLocked
Clouds_Dir = 0.273574,-0.720605,-0.780451 NotLocked
CloudScale = 1 NotLocked
CloudFlatness = 0 NotLocked
CloudTops = 1 NotLocked
CloudBase = -1 NotLocked
CloudDensity = 0.484136 NotLocked
CloudRoughness = 1 NotLocked
CloudContrast = 1 NotLocked
CloudColor = 0.65,0.68,0.7 NotLocked
CloudColor2 = 0.07,0.17,0.24 NotLocked
SunLightColor = 0.7,0.5,0.3 NotLocked
Cloudvar1 = 0.99 NotLocked
Cloudvar2 = 1 NotLocked
CloudIter = 3 NotLocked
CloudBgMix = 1 NotLocked
euclideanTriangleType = 2
dihedralAngles0_234 = 2,2,7
dihedralAngles1_234 = 2,2,6
dihedralAngle0_1 = 7
isRealBall = 0,0,0,0
Iterations = 250
#endpreset

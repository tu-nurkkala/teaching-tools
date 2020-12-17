import "reflect-metadata";
import { Container, Service } from "typedi";

@Service()
class CacheService {
  constructor() {
    console.log("CacheService constructor");
  }
}

@Service()
class HttpService {
  constructor() {
    console.log("HttpService constructor");
  }

  client = (url: string) => `Get stuff from ${url}`;
}

@Service()
class ApiService {
  constructor(private http: HttpService, private cache: CacheService) {
    console.log("ApiService constructor");
    console.log("CACHE IS", cache.constructor.name);
    console.log("HTTP IS", http.constructor.name);
  }
  getTerm = () => "J-Term 2021";
  getSomething = (url: string) => console.log(this.http.client(url));
}

const api1 = Container.get(ApiService);
const api2 = Container.get(ApiService);
const api3 = Container.get(ApiService);
console.log(api1 === api2);
console.log(api1 === api3);
console.log(api2 === api3);

console.log("TERM IS", api1.getTerm());
api1.getSomething("zipface.com");

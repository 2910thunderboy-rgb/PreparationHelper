import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { useNavigate } from "react-router"
import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

export function RegisterForm(props) {

  const navigate = useNavigate()
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  
  const { className, ...rest } = props;

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("");
    setLoading(true);
    try {
      const response = await axios
        .post("http://localhost:3000/api/users/", {
          name,
          email,
          password,
        }, { withCredentials: true })
      localStorage.setItem('authToken', response.data._id);
      localStorage.setItem('user', JSON.stringify(response.data));
      navigate('/app')
      console.log("User created")
    } catch (error) {
      setError(error.response?.data?.message || "Registration failed. Please try again.");
      console.log(error)
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...rest}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">SignIn</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
          > 
            <div className="flex flex-col gap-6">
            <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  onChange={(e) => setName(e.target.value)}
                  id="name"
                  type="text"
                  placeholder="Enter your name"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  onChange={(e) => setEmail(e.target.value)}
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <a
                    href="#"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                  </a>
                </div>
                <Input id="password" type="password" required  onChange={(e) => setPassword(e.target.value) }
                  placeholder="Enter your password"
                />
              </div>
              {error && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{error}</div>}
              <Button type="submit" className="w-full bg-white text-black border border-gray-300 hover:bg-gray-100" disabled={loading}>
                {loading ? 'Creating account...' : 'Sign Up'}
              </Button>
              {/* <Button variant="outline" className="w-full">
                Login with Google
              </Button> */}
            </div>
            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <a href="/login" className="underline underline-offset-4">
                Login
              </a>
            </div>
          </form>
        </CardContent>

      </Card>
    </div>
  );
}
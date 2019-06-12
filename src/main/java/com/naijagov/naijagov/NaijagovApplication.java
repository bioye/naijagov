package com.naijagov.naijagov;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
//(scanBasePackages = {"com.naijagov.naijagov.model" })
public class NaijagovApplication {

	public static void main(String[] args) {
		SpringApplication.run(NaijagovApplication.class, args);
	}

}
